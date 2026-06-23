# URL Shortener

A full-stack URL shortener. Submit a long URL, get back a short code that redirects to it, with Redis caching for fast lookups and click tracking.

## How it works

1. **Shorten** — `POST /shorten` with a long URL inserts a row into Postgres, base62-encodes the new row's `id` into a short code, and saves it back on that row.
2. **Redirect** — `GET /:code` looks up the short code, checking Redis first (24h TTL) before falling back to Postgres on a cache miss. On a hit it 302-redirects to the original URL and fires off an async click-count increment.

## Stack

- **Backend** (`apps/backend`) — Express + TypeScript, Prisma (Postgres), ioredis
- **Frontend** (`apps/frontend`) — Next.js 16 + React 19, Redux Toolkit Query for the API client
- **Packages** — `@repo/ui`, `@repo/eslint-config`, `@repo/typescript-config` shared across apps
- Managed as a Turborepo monorepo (npm workspaces)

## Project structure

```
apps/
  backend/        Express API
    src/
      routes/      shorten.ts, redirect.ts
      services/    shorten.ts, redirect.ts (db + cache logic)
      utils/       base62.ts, validateUrl.ts
      lib/         prisma.ts, redis.ts
    prisma/        schema + migrations
  frontend/        Next.js app
    app/           page.tsx, layout.tsx
    components/    ShortenForm.tsx
    store/         RTK Query api slice
packages/
  ui/, eslint-config/, typescript-config/
docker-compose.yml   Postgres + Redis for local dev
```

## Getting started

### 1. Start Postgres and Redis

```sh
docker compose up -d
```

### 2. Configure environment variables

`apps/backend/.env`:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/urlshortener
REDIS_URL=redis://localhost:6379
PORT=3000
```

`apps/frontend/.env.local`:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

### 3. Install dependencies

```sh
npm install
```

### 4. Run database migrations

```sh
cd apps/backend
npx prisma migrate dev
```

### 5. Start the apps

From the repo root:

```sh
turbo dev
```

This runs the backend on `http://localhost:3000` and the frontend on `http://localhost:3001`.

## API

### `POST /shorten`

```json
{ "originalUrl": "https://example.com/very/long/path" }
```

Returns:

```json
{
  "shortUrl": "http://localhost:3000/abc123",
  "shortCode": "abc123",
  "originalUrl": "https://example.com/very/long/path"
}
```

### `GET /:code`

302-redirects to the original URL, or `404` if the code doesn't exist (or has expired).

### `GET /health`

Returns DB connectivity status.

## Data model

```prisma
model Url {
  id          Int       @id @default(autoincrement())
  shortCode   String    @unique
  originalUrl String
  createdAt   DateTime  @default(now())
  expiresAt   DateTime?
  clickCount  Int       @default(0)
}
```

## Useful commands

```sh
turbo build          # build all apps/packages
turbo dev             # run all apps in dev mode
turbo lint            # lint all apps/packages
turbo check-types     # typecheck all apps/packages
```
