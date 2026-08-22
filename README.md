# Mrroboto9819-portfolio-webapp-2026-2027

Personal portfolio — SvelteKit 2 (Svelte 5) + Tailwind 4, content served from
MongoDB, media from S3-compatible object storage. Rewrite of the previous Nuxt
app.

## Stack

- **SvelteKit 2 / Svelte 5** (runes), `adapter-node`
- **Tailwind 4** via `@tailwindcss/vite`
- **MongoDB 7** driver, no ODM
- **Bun** for install, build and runtime — there is no npm in this project

## Layout

```
src/
├── app.html, app.css          shell + design tokens
├── hooks.server.ts            CSRF guard on /api/v1/* writes
├── lib/
│   ├── types.ts               wire-format types (ObjectId never leaves server)
│   ├── components/            UI
│   └── server/
│       ├── db.ts              Mongo singleton (getDb / pingDb)
│       ├── repository.ts      generic CRUD over one collection
│       └── repositories.ts    one repo per collection + name→repo registry
└── routes/
    ├── +page.server.ts        loads content straight from the repositories
    └── api/v1/
        ├── health/            GET  → { status, db }
        └── [entity]/          GET/POST, and [id]/ GET/PATCH/PUT/DELETE
```

Entities: `stats`, `companies`, `skills`, `projects`, `social`, `credentials`, `extras`.

## Configuration

No configuration is committed, and none is baked into the images. Every value
is injected at run time, so the same artifact runs in every environment:

| environment | source                                        |
| ----------- | --------------------------------------------- |
| local       | `.env` / `.env.local` — gitignored             |
| stage       | Kubernetes Secrets, mounted via `envFrom`      |
| production  | AWS Secrets Manager / task configuration       |

Variables read by the app: `MONGODB_URI`, `MONGODB_DB`, `JWT_ACCESS_SECRET`,
`ADMIN_API_TOKEN`, and the `S3_*` group. `ORIGIN` must match the public host or
`adapter-node` rejects form POSTs. `HOST` and `PORT` are optional —
`adapter-node` already defaults to `0.0.0.0:3000`.

## Develop

Self-contained: Mongo, MinIO and the app, no external dependencies.

```sh
docker compose --env-file .env.local -f docker-compose.local.yml up --build
```

App on `:3000`, MinIO on `:9000`, its console on `:9001`. Every published port
is configurable, since the defaults collide with common local services.

Without containers:

```sh
bun install --ignore-scripts
bun run dev
```

Health check: `curl localhost:3000/api/v1/health`

## Build

```sh
docker build --target stage      -t portfolio-webapp:stage .
docker build --target production -t portfolio-webapp:prod  .
```

Both targets share one build stage, so the artifact you test is the artifact
you ship. They differ only in source maps: `stage` keeps them so stack traces
point at real lines, `production` strips them.

The Bun version is pinned rather than floating — `vite build` crashes on some
releases, so moving it is a deliberate edit plus a rebuild.

## Deploy

Pushing to `develop` builds the stage image on a self-hosted runner, loads it
into the cluster and rolls the deployment forward, with a health smoke test,
automatic rollback on failure, and a notification either way.

Deployment manifests are not in this repo — they hold environment-specific
configuration, so they are applied deliberately rather than by a branch push.
