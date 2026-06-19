# redirect-url — Data Flow

## Service Map

```
Client (browser / curl)
        │
        │ GET /:code  e.g. GET /1
        ▼
┌─────────────────────────────────┐
│         Express Router          │
│         apps/backend            │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│       RedirectService           │
│       src/services/redirect.ts  │
│                                 │
│  1. check Redis                 │
│  2. on miss: query Postgres     │
│  3. populate Redis              │
│  4. fire-and-forget click count │
└──────┬──────────────┬───────────┘
       │              │
       ▼              ▼
┌────────────┐  ┌─────────────────┐
│   Redis    │  │    Postgres     │
│  port 6379 │  │   port 5432     │
└────────────┘  └─────────────────┘
```

---

## Request Lifecycle — Cache HIT

```
1. CLIENT
   GET http://localhost:3000/1

2. EXPRESS ROUTER
   matches route GET /:code
   code = "1"

3. REDIRECT SERVICE
   → redisClient.get("url:1")
   → Redis returns "https://google.com"   ← HIT

4. ROUTE HANDLER
   → fire-and-forget: prisma.url.update clickCount++
   → res.redirect(302, "https://google.com")

5. CLIENT RECEIVES
   HTTP 302
   Location: https://google.com
   (browser follows redirect automatically)

Total time: ~1ms
```

---

## Request Lifecycle — Cache MISS

```
1. CLIENT
   GET http://localhost:3000/1

2. EXPRESS ROUTER
   matches route GET /:code
   code = "1"

3. REDIRECT SERVICE
   → redisClient.get("url:1")
   → Redis returns null                   ← MISS

4. REDIRECT SERVICE
   → prisma.url.findUnique({ where: { shortCode: "1" } })
   → Postgres returns { id: 1, originalUrl: "https://google.com", expiresAt: null, ... }

5. REDIRECT SERVICE
   → check expiresAt: null → not expired, continue
   → redisClient.set("url:1", "https://google.com", "EX", 86400)
      ↳ Redis now caches it for 24 hours

6. ROUTE HANDLER
   → fire-and-forget: prisma.url.update clickCount++
   → res.redirect(302, "https://google.com")

7. CLIENT RECEIVES
   HTTP 302
   Location: https://google.com

Total time: ~5-15ms
```

---

## Request Lifecycle — Not Found

```
1. CLIENT
   GET http://localhost:3000/xyz999

2-3. same as cache miss path

4. REDIRECT SERVICE
   → redisClient.get("url:xyz999") → null
   → prisma.url.findUnique({ where: { shortCode: "xyz999" } }) → null

5. ROUTE HANDLER
   → res.status(404).json({ error: "short URL not found" })

6. CLIENT RECEIVES
   HTTP 404
   { "error": "short URL not found" }
```

---

## Request Lifecycle — Expired URL

```
1-4. same as cache miss path, DB returns row with expiresAt set

5. REDIRECT SERVICE
   → check: expiresAt < now()  → expired
   → redisClient.del("url:code")   ← evict from cache immediately
   → return null to route handler

6. ROUTE HANDLER
   → res.status(404).json({ error: "short URL not found" })
```

---

## Data Flow Through Redis

```
First request (MISS):
  Redis: {}

  GET /1 → miss → DB query → found
  Redis.set("url:1", "https://google.com", EX 86400)

  Redis: { "url:1": "https://google.com" TTL:86400 }

Second request (HIT):
  Redis: { "url:1": "https://google.com" TTL:86399 }

  GET /1 → hit → redirect immediately
  DB never touched

After 24 hours:
  Redis: {}   ← TTL expired, key evicted automatically
  Next request will be a miss again → DB query → re-populate cache
```

---

## Click Count — Fire and Forget

```typescript
// this runs AFTER redirect is sent - user is already gone
prisma.url.update({
  where: { shortCode: code },
  data: { clickCount: { increment: 1 } }
}).catch(err => console.error('click count update failed:', err))

// redirect happens immediately, doesn't wait for above
res.redirect(302, originalUrl)
```

The user's browser starts loading the destination before the DB write even starts.

---

## File Structure After This Feature

```
apps/backend/src/
  index.ts                  ← mounts redirect route
  lib/
    prisma.ts               ← singleton prisma client
    redis.ts                ← singleton redis client  ← NEW
  routes/
    shorten.ts
    redirect.ts             ← GET /:code route handler  ← NEW
  services/
    shorten.ts
    redirect.ts             ← redirect business logic   ← NEW
  utils/
    base62.ts
    validateUrl.ts
```

---

## Environment Variables Used

```
DATABASE_URL   → Prisma → Postgres
REDIS_URL      → ioredis → Redis
```