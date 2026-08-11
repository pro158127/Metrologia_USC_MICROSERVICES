# AGENTS.md

## Repository overview

Monorepo (pnpm workspace) for a metrology laboratory management system.
- **`Backend/`** — Fastify 5 REST API (port 3001) with Socket.IO, PostgreSQL LISTEN/NOTIFY, Prisma, MinIO (S3-compatible), JWT auth.
- **`Frontend/`** — Next.js 16 app (port 3000) with NextAuth v5, Zustand, custom HTTP server for Socket.IO and Postgres LISTEN/NOTIFY.
- **`metrologia/`** — Shared code (dashboard modules). Not a separate package; re-used inside Frontend.
- Infrastructure: PostgreSQL (pgvector), Redis, MinIO — all orchestrated via `docker-compose.yml`.

## Commands

```bash
# Start everything with Docker
docker-compose up --build

# Run individual packages (pnpm from workspace root)
pnpm --filter backend dev          # Backend: tsx watch src/server.ts
pnpm --filter metrologia dev       # Frontend: next dev (port 3000)
pnpm --filter metrologia dev:server # Custom server with Socket.IO: ts-node server.ts
pnpm --filter metrologia lint      # Frontend ESLint (Next.js flat config)
pnpm --filter backend build        # Backend: tsc (compiles src/ → dist/)

# Prisma (run from Backend/ or Frontend/)
pnpm exec prisma generate          # Regenerate Prisma client
pnpm exec prisma studio --browser none  # Open Prisma Studio
```

**Important:** `pnpm-workspace.yaml` uses lowercase names (`backend`, `frontend`) but actual dirs are `Backend/` and `Frontend/`. The workspace still resolves because pnpm matches packages by `package.json` location, not directory name.

## Architecture constraints

### Two separate Prisma schemas — do NOT unify carelessly

Both `Backend/prisma/schema.prisma` and `Frontend/prisma/schema.prisma` point to the **same PostgreSQL database** but generate independent Prisma clients. They use different field-naming conventions:

- **Backend** uses raw DB column names (`NOMBRE_COMPLETO`, `ID_ROL_FK`) — no `@map` annotations.
- **Frontend** uses camelCase model fields with `@map` to the same DB columns (`nombreCompleto @map("NOMBRE_COMPLETO")`).
- The Backend schema is the **source of truth** for DB structure. The Frontend schema is a subset/copy with its own style.
- When adding or changing DB columns, update **both** schemas.

### Real-time notification architecture

Both Backend and Frontend independently connect to PostgreSQL's `LISTEN/NOTIFY` on the `cambio_tablas` channel:

1. A DB trigger (not in this repo) fires `NOTIFY cambio_tablas` with a JSON payload `{ tabla, operacion, data }`.
2. **Backend** (`src/plugins/postgrest-listener.ts`) receives it and emits via Socket.IO to the frontend. It routes `notificaciones` events to per-user rooms (`user_room_<id>`).
3. **Frontend** (`server.ts`) also listens directly and emits via its own Socket.IO instance. This is a **duplicate listener** — be aware when debugging real-time issues.
4. Backend hardcodes the connection string in `postgrest-listener.ts` — it ignores `DATABASE_URL_LOCAL` env var.

### Auth flow

- **NextAuth v5** (Next.js side): Credentials provider with Argon2 password verification. JWT sessions (30 min maxAge). The `AUTH_SECRET` env var must match between frontend and backend.
- **Backend JWT** (`@fastify/jwt`): Uses the same `AUTH_SECRET` secret. The frontend generates a backend-bound token via `jose` in `app/lib/auth-token.ts` and sends it in the `Authorization` header to backend routes.
- Auth guards on backend routes use `fastify.authenticate` (from `plugins/auth.ts`).

### Environment variables

Required across both packages:
- `DATABASE_URL_LOCAL` — PostgreSQL connection string
- `DATABASE_URL_AWS` — Production DB (used by docker-compose)
- `AUTH_SECRET` — Shared JWT secret (must be identical frontend/backend)
- `REDIS_URL` — Redis connection (for caching, currently file-based by default)
- `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET_NAME` — MinIO/S3 storage
- `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`, `NEXT_PUBLIC_MINIO_URL` — Frontend-only public URLs

### Docker Compose notes

- `Backend/` volume is mounted into the container at `/app`, with `/app/node_modules` as an anonymous volume (prevents host `node_modules` from overriding container's).
- Backend container runs `prisma generate` before `pnpm dev` on startup.
- Frontend container runs `prisma generate` before `pnpm dev` (does NOT use the custom `server.ts` in Docker).
- MinIO console is on port 9001, API on 9000.

## Development gotchas

- **No tests exist** in this repo. There is no test runner configured.
- **No CI/CD workflows** — `.github/workflows/` is empty.
- **No Prettier config** — only ESLint (Next.js flat config) on the frontend.
- The `Backend/` `package.json` has no `lint` or `test` scripts.
- The `metrologia/` directory does not have its own `package.json` — it is NOT a workspace package. Its `app/dashboard/module/` contains modules consumed by the Frontend.
- There is a stale schema backup file: `Frontend/schem43434a.prisma` — likely a copy artifact, ignore it.
- `Backend/src/routes/audit.ts` creates its own `new PrismaClient()` instead of using the Fastify-decorated `prisma` — be consistent if modifying routes.

## Conventions

- Spanish is used for DB columns, model names, API endpoints, and UI.
- Backend uses Fastify plugins wrapped with `fastify-plugin` (fp) to share decorated instances (`prisma`, `io`).
- Frontend uses `@/` path alias mapped to the project root.
- Frontend state management uses Zustand (`app/stores/dbstore.ts`).
- File-based cache: `app/lib/cache/chacheService.ts` uses local `.cache/snapshots/` by default. Set `CACHE_DRIVER=redis` to switch to Redis (stub implementation).
