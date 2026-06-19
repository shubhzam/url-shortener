# redirect-url — Technical Spec

## Problem

Given a short code, find the original URL and redirect the client to it. This is
the hottest read path in the entire system - every click on a short link hits this
endpoint. It must be fast.

---

## Endpoint

```
GET /:code

Response 301:
  Location: https://original-long-url.com
  (no body - browser follows the redirect automatically)

Response 404:
  { "error": "short URL not found" }
```

---

## Why 301 vs 302

| code | meaning         | browser behavior                          |
|------|-----------------|-------------------------------------------|
| 301  | moved permanently | browser caches the redirect, skips our server on repeat visits |
| 302  | found (temporary) | browser always hits our server, we can track every click |

**We use 302.** Here's why: 301 is faster for the user on repeat visits because
the browser never hits our server again. But that means we lose click tracking -
we never see the request. Since analytics (`clickCount`) is a feature we want,
302 is the right call. Every redirect goes through us.

At scale (billions of redirects), you'd reconsider - but for this project 302 is correct.

---

## Cache Strategy — Cache Aside (Lazy Population)

```
GET /:code
  → check Redis: GET url:{code}
  → HIT  → redirect immediately, skip DB         (~1ms)
  → MISS → query Postgres, write to Redis, redirect (~5-15ms)
```

Redis is populated on the first miss. No pre-warming needed.

**Key format:** `url:{shortCode}` — e.g. `url:1`, `url:aB3xZ9`
**TTL:** 86400 seconds (24 hours)

---

## Click Tracking

On every redirect, increment `clickCount` on the DB row:

```
prisma.url.update({ where: { shortCode }, data: { clickCount: { increment: 1 } } })
```

**Important:** do this asynchronously - don't make the user wait for the DB write
before getting redirected. Fire and forget.

```typescript
// don't await this - user gets redirected immediately
prisma.url.update(...).catch(err => console.error('click count update failed:', err))
```

---

## Schema (no changes needed)

```prisma
model Url {
  id          Int       @id @default(autoincrement())
  shortCode   String    @unique
  originalUrl String
  createdAt   DateTime  @default(now())
  expiresAt   DateTime?
  clickCount  Int       @default(0)      ← incremented here
}
```

---

## API Contract

### Request

| param | type   | location    | description        |
|-------|--------|-------------|--------------------|
| code  | string | URL param   | the short code     |

### Responses

| status | when                  | body                            |
|--------|-----------------------|---------------------------------|
| 302    | code found            | no body, Location header set    |
| 404    | code not found in DB  | `{ error: "short URL not found" }` |
| 500    | DB or Redis error     | `{ error: "internal server error" }` |

---

## Edge Cases

| case                          | handling                                              |
|-------------------------------|-------------------------------------------------------|
| code doesn't exist            | 404                                                   |
| code exists but URL expired   | check `expiresAt` — if past, return 404, delete from cache |
| Redis down                    | fall through to DB — cache miss is not an error       |
| DB down                       | return 500                                            |
| code is empty string          | Express won't match the route, falls through to 404   |
| Redis has stale entry         | TTL handles eviction — 24hr max staleness             |

---

## Trade-offs

**Fire-and-forget click tracking:**
We don't await the `clickCount` increment. This means if the server crashes
between the redirect and the DB write, we lose that click. Acceptable — analytics
are approximate by nature. The alternative (awaiting before redirect) adds latency
on every single redirect for a non-critical feature.

**No cache invalidation on delete:**
If a URL gets deleted from the DB, Redis may still serve it for up to 24 hours.
We'll handle this when we build the delete endpoint — for now, TTL-based eviction
is sufficient.

**302 over 301:**
Explained above. 302 costs one extra network hop per redirect vs 301's browser
cache. Worth it for click tracking.