#!/usr/bin/env bash
# First-boot bootstrap. Rendered by Terraform's templatefile() — dollar-brace
# sequences are filled in by Terraform before the instance ever sees the
# file, and double-dollar ones are real shell that Terraform leaves alone.
# Runs once as root; everything it prints lands in /var/log/user-data.log
# for debugging a bad boot.
#
# It installs Docker + Caddy + the AWS CLI, writes the Caddyfile, the
# systemd unit for the app, and /usr/local/bin/portafolio-redeploy — the one
# script both you (via Session Manager) and CI (via SSM Run Command) call to
# ship a new image.
set -euo pipefail
exec > >(tee -a /var/log/user-data.log) 2>&1

export DEBIAN_FRONTEND=noninteractive

# ---- packages --------------------------------------------------------------
apt-get update -y
apt-get install -y docker.io curl unzip jq \
  debian-keyring debian-archive-keyring apt-transport-https

# AWS CLI v2 — the instance uses it to read SSM parameters at deploy time.
if ! command -v aws >/dev/null; then
  curl -sSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
  unzip -q /tmp/awscliv2.zip -d /tmp
  /tmp/aws/install
  rm -rf /tmp/aws /tmp/awscliv2.zip
fi

# Caddy, from its official repo — the Ubuntu archive's build lags.
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y
apt-get install -y caddy

systemctl enable --now docker

# ---- Caddy -----------------------------------------------------------------
# Three jobs: terminate TLS (Let's Encrypt, auto-renewed), proxy the app, and
# map the legacy /cdn/portafolio/ prefix onto the S3 bucket so every media URL
# already stored in Mongo keeps resolving. handle_path strips the matched
# prefix — the same thing the Traefik stripPrefix middleware does on k3s — so
# the bucket name never has to match the old path.
cat > /etc/caddy/Caddyfile <<'CADDYFILE'
${domain} {
	# PRE-CUTOVER TESTING ONLY: while DNS still points at k3s, Let's Encrypt
	# cannot issue a cert for this host. Uncomment `tls internal`, reload
	# caddy, and test through a hosts-file entry (accepting the browser
	# warning). Remove it again at cutover.
	# tls internal

	encode zstd gzip

	# /cdn/portafolio/<key> -> s3://${media_bucket}/<key>
	handle_path /cdn/portafolio/* {
		reverse_proxy https://${media_bucket}.s3.${region}.amazonaws.com {
			header_up Host {upstream_hostport}
		}
	}

	handle {
		reverse_proxy 127.0.0.1:3000
	}
}

# www must redirect, never serve: ORIGIN is a single value, and if www served
# the app directly every admin form POST from www would be rejected as
# cross-origin while the apex worked fine.
www.${domain} {
	# tls internal
	redir https://${domain}{uri} permanent
}
CADDYFILE

systemctl enable caddy
systemctl restart caddy

# ---- the app as a systemd unit ---------------------------------------------
# The unit always runs :current — a local alias tag that portafolio-redeploy
# points at whatever was last pulled and health-checked. Restart policy plus
# Docker gives us what the k3s Deployment gave us: it comes back if it dies.
mkdir -p /etc/portafolio

cat > /etc/systemd/system/portafolio.service <<'UNIT'
[Unit]
Description=portafolio web app
Requires=docker.service
After=docker.service network-online.target

[Service]
ExecStartPre=-/usr/bin/docker rm -f portafolio
ExecStart=/usr/bin/docker run --rm --name portafolio \
  --env-file /etc/portafolio/env \
  --log-opt max-size=10m --log-opt max-file=3 \
  -p 127.0.0.1:3000:3000 \
  ${app_image}:current
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

# ---- the deploy script -----------------------------------------------------
cat > /usr/local/bin/portafolio-redeploy <<'DEPLOY'
#!/usr/bin/env bash
# Refresh secrets from SSM, pull an image tag, restart, health-check.
#   portafolio-redeploy [tag]      (defaults to latest)
# Called by CI through SSM Run Command, or by hand from a Session Manager
# shell. Exits non-zero if the app does not come up healthy, which is what
# turns the GitHub Actions run red.
set -euo pipefail

TAG="$${1:-latest}"
IMAGE="${app_image}"
REGION="${region}"
PREFIX="${param_prefix}"
BUCKET="${media_bucket}"
DOMAIN="${domain}"

# 1. Secrets. Every parameter directly under $PREFIX becomes one NAME=value
# line — parameters are named exactly after the env var they set. The
# deploy/ subpath is deliberately excluded (no --recursive): it holds
# deploy-only values like the GHCR token that must not leak into the app.
TMP=$(mktemp)
aws ssm get-parameters-by-path --path "$PREFIX" --with-decryption \
  --region "$REGION" --query 'Parameters[].[Name,Value]' --output text |
while IFS=$'\t' read -r name value; do
  printf '%s=%s\n' "$(basename "$name")" "$value" >> "$TMP"
done

if ! grep -q '^MONGODB_URI=' "$TMP"; then
  echo "MONGODB_URI missing under $PREFIX — set the SSM parameters first (infra/README.md step 5)." >&2
  rm -f "$TMP"
  exit 1
fi

# 2. Static config. The four load-bearing ones: ORIGIN must match the public
# host exactly or adapter-node rejects every form POST as cross-origin, and
# BODY_SIZE_LIMIT lifts adapter-node's 512K default so mp3 uploads survive.
# S3_PUBLIC_BASE stays /cdn/portafolio — every media URL in Mongo is stored
# in that shape and Caddy makes the path resolve; no S3_ENDPOINT and no
# S3_ACCESS_KEY/S3_SECRET_KEY, so s3.ts falls through to the instance role.
{
  echo "NODE_ENV=production"
  echo "PORT=3000"
  echo "ORIGIN=https://$DOMAIN"
  echo "BODY_SIZE_LIMIT=32M"
  echo "S3_BUCKET=$BUCKET"
  echo "S3_REGION=$REGION"
  echo "S3_PUBLIC_BASE=/cdn/portafolio"
} >> "$TMP"
chmod 600 "$TMP"
mv "$TMP" /etc/portafolio/env

# 3. GHCR login, only if the image is private and a token was provided.
if GHCR_TOKEN=$(aws ssm get-parameter --name "$PREFIX/deploy/GHCR_TOKEN" \
     --with-decryption --region "$REGION" \
     --query Parameter.Value --output text 2>/dev/null); then
  GHCR_USER=$(aws ssm get-parameter --name "$PREFIX/deploy/GHCR_USER" \
     --region "$REGION" --query Parameter.Value --output text)
  printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
fi

# 4. Pull, retag, restart.
docker pull "$IMAGE:$TAG"
docker tag "$IMAGE:$TAG" "$IMAGE:current"
systemctl restart portafolio

# 5. Health gate — the same check the k3s smoke test does. "db":true proves
# the app is up AND Atlas is reachable through the allowlist.
for _ in $(seq 1 30); do
  sleep 2
  BODY=$(curl -fsS --max-time 3 http://127.0.0.1:3000/api/v1/health 2>/dev/null || true)
  case "$BODY" in
    *'"db":true'*)
      echo "healthy: $BODY"
      docker image prune -f >/dev/null
      exit 0
      ;;
  esac
done

echo "UNHEALTHY after 60s — last container logs:" >&2
docker logs --tail 50 portafolio >&2 || true
exit 1
DEPLOY
chmod 0755 /usr/local/bin/portafolio-redeploy

systemctl daemon-reload
systemctl enable portafolio

# First deploy — expected to fail politely on the very first boot, before the
# SSM parameters exist. Once they do: rerun portafolio-redeploy.
/usr/local/bin/portafolio-redeploy latest \
  || echo "First deploy skipped — set the SSM parameters, then run portafolio-redeploy."

echo "bootstrap complete"
