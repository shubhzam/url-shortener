# db-init — Data Flow

## Service Map

```
┌─────────────────────────────────────────────────┐
│                  Docker Network                  │
│                                                  │
│   ┌─────────────┐       ┌─────────────────────┐ │
│   │  PostgreSQL │       │        Redis         │ │
│   │  port 5432  │       │      port 6379       │ │
│   └──────┬──────┘       └──────────┬───────────┘ │
│          │                         │              │
└──────────┼─────────────────────────┼─────────────┘
           │                         │
    Prisma Client              ioredis client
           │                         │
           └────────────┬────────────┘
                        │
                ┌───────┴────────┐
                │  Express App   │
                │  port 3000     │
                └───────┬────────┘
                        │
                   HTTP requests
                        │
                   your browser / curl
```

---

## Connection Lifecycle

### App startup

```
1. ts-node-dev starts src/index.ts
2. Prisma Client initializes → opens connection pool to Postgres
   - reads DATABASE_URL from .env
   - default pool: 10 connections
3. ioredis client initializes → connects to Redis
   - reads REDIS_URL from .env
   - single persistent TCP connection, auto-reconnects
4. Express starts listening on PORT
5. App is ready to serve requests
```

### On every redirect request: GET /:code

```
Request → Express router
        → middleware (json parse, logging)
        → route handler
        → RedisClient.get("url:{code}")
             │
             ├── HIT ──→ return 301 Location: {originalUrl}   ← ~1ms
             │
             └── MISS → PrismaClient.url.findUnique({ where: { shortCode: code } })
                              │
                              ├── FOUND → RedisClient.set("url:{code}", originalUrl, EX 86400)
                              │         → return 301 Location: {originalUrl}   ← ~5-15ms
                              │
                              └── NOT FOUND → return 404
```

### On shorten request: POST /shorten

```
Request body: { originalUrl: "https://..." }
        → validate URL format
        → generate shortCode
        → PrismaClient.url.create({ data: { shortCode, originalUrl } })
             │
             ├── SUCCESS → return 201 { shortUrl: "http://localhost:3000/{code}" }
             │
             └── UNIQUE VIOLATION → retry with new shortCode (up to 3x)
```

---

## Data at Rest

### Postgres `urls` table row

```
id          | shortCode | originalUrl                        | createdAt           | expiresAt | clickCount
------------+-----------+------------------------------------+---------------------+-----------+-----------
1           | aB3xZ9    | https://example.com/very/long/path | 2024-01-15 10:23:00 | null      | 142
```

### Redis key

```
key:   url:aB3xZ9
value: https://example.com/very/long/path
TTL:   86400 seconds (24 hours)
```

---

## Environment Variables Flow

```
.env file (git-ignored)
    │
    ├── DATABASE_URL ──→ Prisma Client ──→ Postgres TCP connection
    ├── REDIS_URL    ──→ ioredis        ──→ Redis TCP connection
    └── PORT         ──→ Express        ──→ HTTP listener
```

`.env` is never committed. `.env.example` is committed with placeholder values
so teammates know what vars are needed.

---

## What Prisma Manages

```
prisma/
  schema.prisma    ← source of truth for DB schema
  migrations/      ← auto-generated SQL migration files
                     (committed to git, run in order on each env)
```

**Migration flow:**
```
edit schema.prisma
    → npx prisma migrate dev --name {migration-name}
    → Prisma diffs schema vs current DB state
    → generates SQL in prisma/migrations/
    → runs SQL against local Postgres
    → regenerates Prisma Client types
```

You never write raw `CREATE TABLE` SQL. Prisma handles it.