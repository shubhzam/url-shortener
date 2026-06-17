# db-init — Technical Spec

## Problem

We need a persistent store for URL mappings (short code → long URL) and a cache layer
to serve redirects fast without hitting the DB on every request.

---

## What We're Setting Up

| layer     | technology       | purpose                                      |
|-----------|------------------|----------------------------------------------|
| database  | PostgreSQL 15    | persistent storage for URL records           |
| cache     | Redis 7          | fast short-code lookups, TTL-based expiry    |
| ORM       | Prisma           | type-safe DB access, migrations, schema mgmt |
| runtime   | Docker Compose   | runs Postgres + Redis locally in containers  |

---

## Schema Design

### `Url` table

```prisma
model Url {
  id          Int      @id @default(autoincrement())
  shortCode   String   @unique           // e.g. "aB3xZ9"
  originalUrl String                     // e.g. "https://example.com/very/long/path"
  createdAt   DateTime @default(now())
  expiresAt   DateTime?                  // null = never expires
  clickCount  Int      @default(0)       // basic analytics
}
```

**Why these fields:**
- `shortCode` is the lookup key — needs a unique index, this is your hottest read path
- `originalUrl` has no length limit in Postgres (TEXT type) — URLs can be arbitrarily long
- `expiresAt` nullable — most links never expire, don't force a value
- `clickCount` kept on the row for simplicity now — at scale you'd move this to a separate
  analytics table to avoid write contention on every redirect

### Why not UUID as primary key?

The book (Alex Yu ch.8) discusses this. Auto-increment int is fine for our scale.
UUID as PK causes index fragmentation on high-write tables because UUIDs are random —
new rows don't insert at the end of the B-tree, they scatter. For a URL shortener with
heavy writes, that matters. Int autoincrement always appends.

---

## Redis Cache Strategy

**Pattern:** cache-aside (lazy population)

```
GET /:code
  → check Redis for key `url:{code}`
  → HIT: return cached originalUrl, skip DB
  → MISS: query Postgres, write to Redis with TTL, return
```

**TTL:** 24 hours default. Frequently accessed URLs stay hot. Expired/deleted URLs
evict naturally.

**Key format:** `url:{shortCode}` — e.g. `url:aB3xZ9`

---

## Docker Compose Setup

Both services run in a `url-shortener` Docker network so they can talk to each other
by service name (`postgres`, `redis`) rather than hardcoded IPs.

Environment variables are read from a `.env` file — never hardcode credentials.

---

## Environment Variables

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/urlshortener"
REDIS_URL="redis://localhost:6379"
PORT=3000
```

---

## Edge Cases

| case                          | handling                                              |
|-------------------------------|-------------------------------------------------------|
| DB is down                    | Prisma throws, Express returns 503                    |
| Redis is down                 | fall through to DB — cache is not source of truth     |
| URL record deleted from DB    | Redis may still serve stale cache until TTL expires   |
| `originalUrl` is not a URL    | validate at API layer before it reaches DB            |
| duplicate `shortCode`         | Prisma unique constraint throws — handle at service layer |

---

## Trade-offs

**Prisma vs raw SQL:** Prisma gives you type safety and migrations out of the box.
The cost is a slightly higher query overhead vs hand-written SQL. For this scale,
irrelevant. The DX win is worth it.

**Redis as optional layer:** If Redis goes down, the app still works — slower, but
correct. This is the right architecture: cache improves performance, doesn't gate
correctness.

**Single Postgres instance:** Fine for dev and moderate prod load. At Alex Yu's
"100M URLs" scale you'd add read replicas and shard by shortCode hash range.
We're not there — don't over-engineer it yet.