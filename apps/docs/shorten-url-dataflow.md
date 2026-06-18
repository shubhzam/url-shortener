# shorten-url — Data Flow

## Service Map

```
Client (curl / browser / frontend)
        │
        │ POST /shorten
        │ { "originalUrl": "https://example.com/..." }
        ▼
┌─────────────────────────────────┐
│         Express Router          │
│         apps/backend            │
│                                 │
│  1. parse JSON body             │
│  2. validate originalUrl        │
│  3. call ShortenService         │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│         ShortenService          │
│         src/services/           │
│                                 │
│  1. prisma.url.create()         │
│  2. encode(id) → shortCode      │
│  3. prisma.url.update()         │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│         Prisma Client           │
│         + PrismaPg adapter      │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│     PostgreSQL (Docker)         │
│     urls table                  │
└─────────────────────────────────┘
```

---

## Request Lifecycle — Happy Path

```
1. CLIENT
   POST http://localhost:3000/shorten
   Headers: Content-Type: application/json
   Body: { "originalUrl": "https://example.com/very/long/path" }

2. EXPRESS MIDDLEWARE
   express.json() parses body → req.body = { originalUrl: "https://..." }

3. ROUTE HANDLER (src/routes/shorten.ts)
   → extract originalUrl from req.body
   → validate: new URL(originalUrl) — throws if invalid
   → validate: protocol must be http: or https:
   → call shortenService.create(originalUrl)

4. SERVICE (src/services/shorten.ts)
   → prisma.url.create({ data: { originalUrl, shortCode: '' } })
      ↳ Postgres generates id = 1342
      ↳ row inserted: { id: 1342, shortCode: '', originalUrl: '...' }
   → encode(1342) → "Mq"
   → prisma.url.update({ where: { id: 1342 }, data: { shortCode: 'Mq' } })
      ↳ row updated: { id: 1342, shortCode: 'Mq', originalUrl: '...' }
   → return { shortCode: 'Mq', originalUrl: '...' }

5. ROUTE HANDLER
   → build shortUrl = `${BASE_URL}/${shortCode}` = "http://localhost:3000/Mq"
   → res.status(201).json({ shortUrl, shortCode, originalUrl })

6. CLIENT RECEIVES
   HTTP 201
   {
     "shortUrl": "http://localhost:3000/Mq",
     "shortCode": "Mq",
     "originalUrl": "https://example.com/very/long/path"
   }
```

---

## Request Lifecycle — Validation Failure

```
1. CLIENT
   POST /shorten
   Body: { "originalUrl": "not-a-url" }

2. EXPRESS MIDDLEWARE
   body parsed → req.body = { originalUrl: "not-a-url" }

3. ROUTE HANDLER
   → new URL("not-a-url") throws TypeError
   → catch → res.status(400).json({ error: "invalid URL" })

4. CLIENT RECEIVES
   HTTP 400
   { "error": "invalid URL" }

   ← DB is never touched
```

---

## Request Lifecycle — DB Failure

```
1-3. same as happy path

4. SERVICE
   → prisma.url.create(...) throws PrismaClientKnownRequestError
   → caught in route handler
   → res.status(500).json({ error: "internal server error" })

5. CLIENT RECEIVES
   HTTP 500
   { "error": "internal server error" }
```

---

## Data at Rest After Successful Shorten

### Postgres row

```
id   | shortCode | originalUrl                        | createdAt           | expiresAt | clickCount
-----+-----------+------------------------------------+---------------------+-----------+-----------
1342 | Mq        | https://example.com/very/long/path | 2024-01-15 10:23:11 | null      | 0
```

### Redis

```
Nothing written yet — cache is populated lazily on the first GET /:code request.
```

---

## File Structure After This Feature

```
apps/backend/src/
  index.ts                  ← express app, mounts routes
  lib/
    prisma.ts               ← singleton prisma client
  routes/
    shorten.ts              ← POST /shorten route handler
  services/
    shorten.ts              ← business logic, DB writes
  utils/
    base62.ts               ← encode() function
    validateUrl.ts          ← isValidUrl() function
```

---

## Environment Variables Used

```
DATABASE_URL   → Prisma → Postgres connection
BASE_URL       → building the full short URL in the response
PORT           → Express listener
```

Add `BASE_URL` to `.env`:
```
BASE_URL="http://localhost:3000"
```