# Two deployable targets, one shared build:
#
#   stage       → the k3s cluster        docker build --target stage      -t portfolio-webapp:stage .
#   production  → the production app     docker build --target production -t portfolio-webapp:prod  .
#
# Local development does NOT use this file — that's docker-compose.dev.yml
# (which builds Dockerfile.dev with a bind mount for hot reload). This file is
# also what you build locally when you want to exercise the real production
# server before shipping it.
#
# The cluster runs imagePullPolicy: Never and there is no registry, so CI
# builds these straight into the node's containerd.
#
# Bun is the only runtime here — install, build and serve. The tag is pinned
# rather than floating on 1.3: `vite build` crashes on bun 1.3.14 (it calls
# `node:v8 isBuildingSnapshot`, which that release doesn't implement). 1.3.10
# is the version this lockfile and build are verified against, so moving it is
# a deliberate edit with a rebuild, not something a base-image refresh does to
# you overnight.
ARG BUN_VERSION=1.4.0

# ---- dependencies ----
# --ignore-scripts: no dependency's install hooks run, ever. Combined with the
# empty trustedDependencies in package.json this means `bun install` cannot
# execute third-party code, which is the whole point of pinning a lockfile.
FROM oven/bun:${BUN_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

# ---- build ----
FROM oven/bun:${BUN_VERSION}-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# ---- production dependencies ----
# A second, devDependency-free tree for the runtime image. Building it here
# rather than pruning in place keeps the 300-odd MB of vite/svelte/typescript
# out of the shipped layers entirely.
FROM oven/bun:${BUN_VERSION}-alpine AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts --production

# ---- shared runtime ----
# adapter-node emits a self-contained server in build/. Everything both
# targets have in common lives here; the targets below only set policy.
#
# No ENV is declared anywhere in this file, deliberately. The image is code and
# nothing else — every value (ORIGIN, NODE_ENV, MONGODB_URI, JWT_*, S3_*) is
# supplied at run time: from the Kubernetes Secrets in the cluster, and from
# .env.local under Compose. Two reasons that matters:
#
#   1. Nothing about an environment leaks from a published image. `docker
#      history` and `docker inspect` on a baked ENV show hostnames and config
#      to anyone holding the image.
#   2. One image is promotable. If stage config were compiled in, the artifact
#      verified on beta would not be the artifact shipped to production.
#
# Safe to omit rather than merely tidy: adapter-node already defaults HOST to
# 0.0.0.0 and PORT to 3000 (files/index.js), so the container binds correctly
# with no environment at all.
FROM oven/bun:${BUN_VERSION}-alpine AS runtime
WORKDIR /app

# The admin's YouTube module shells out to these, so they are a RUNTIME
# dependency of the image, not a build tool:
#
#   ffmpeg   transcodes the downloaded audio to mp3 (fluent-ffmpeg drives it)
#   yt-dlp   resolves and streams the audio
#   python3  yt-dlp ships as a Python zipapp; nothing else in the image wants it
#
# yt-dlp deliberately does NOT come from Alpine's repository, and that is the
# whole point of this block. Alpine freezes a package version per release
# branch: 3.22 — what oven/bun:1.4.0-alpine is built on — shipped yt-dlp
# 2025.11.12 and will never move off it. yt-dlp is the one dependency here
# that MUST track upstream, because YouTube changes its player every few weeks
# and a stale extractor gets answered with "Sign in to confirm you're not a
# bot". So `apk add yt-dlp` made rebuilding the image look like a fix while
# silently reinstalling the same nine-month-old build.
#
# The upstream release asset is a self-contained Python zipapp: no pip, no
# build toolchain, and it runs on musl — unlike `yt-dlp_linux`, which is
# PyInstaller-built against glibc and will not start here. Pinned by version
# AND by the checksum from the release's own SHA2-256SUMS, so the build is
# reproducible and a swapped asset fails the build instead of shipping.
#
# TO UPDATE — expect this every month or two, it is the routine fix when
# grabs start failing:
#   1. take the version and the `yt-dlp` line from
#      https://github.com/yt-dlp/yt-dlp/releases/latest  (the plain `yt-dlp`
#      asset and its SHA2-256SUMS entry, NOT `yt-dlp_linux`)
#   2. bump both ARGs, rebuild, redeploy.
ARG YTDLP_VERSION=2026.08.19
ARG YTDLP_SHA256=1fa6733c37ea6fb51c99ad8fe785e7b7e5f3246c9b980230329d4fb72ed8d4d6
RUN apk add --no-cache ffmpeg python3 && \
	wget -qO /usr/local/bin/yt-dlp \
		"https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp" && \
	echo "${YTDLP_SHA256}  /usr/local/bin/yt-dlp" | sha256sum -c - && \
	chmod 0755 /usr/local/bin/yt-dlp && \
	yt-dlp --version

COPY --from=build     /app/build        ./build
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build     /app/package.json ./package.json

RUN addgroup -g 10001 app && adduser -u 10001 -G app -S app

# Normalise read permissions. COPY preserves the source mode, so a restrictive
# host umask or a group-only ACL on the working tree (e.g. 660 root:pcc) rides
# into the image and leaves /app unreadable to the non-root runtime user. That
# fails badly rather than loudly: adapter-node's static handler streams files,
# and the ReadStream EACCES surfaces as an unhandled 'error' event that takes
# the whole process down — one request for one unreadable asset crashes the
# server. a+rX grants read on files and traverse on directories, no write.
RUN chmod -R a+rX /app

EXPOSE 3000

# ---- stage (k3s cluster) ----
# Source maps are kept so a stack trace from the cluster points at real lines.
# ORIGIN and every other setting arrive from the Secrets referenced by
# k8s/deployment.yaml — see the note on the runtime stage.
FROM runtime AS stage
USER app
CMD ["bun", "build/index.js"]

# ---- production ----
# Source maps stripped: smaller image, and no server source handed out in
# traces. This is the ONLY difference from stage — the environments themselves
# are distinguished entirely by injected configuration, never by the image.
#
# ORIGIN must be set by whatever runs this (AWS Secrets Manager / task
# definition) and must match the public host, or adapter-node rejects form
# POSTs as cross-origin.
FROM runtime AS production
RUN find ./build -name '*.map' -delete
USER app
CMD ["bun", "build/index.js"]
