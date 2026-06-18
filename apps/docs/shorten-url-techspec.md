# shorten-url — Technical Spec

## Problem

Given a long URL, generate a unique short code, persist the mapping, and return
a shortened URL the user can share. This is the core write path of the entire system.

---

## Endpoint

```
POST /shorten
Content-Type: application/json

Body: { "originalUrl": "https://example.com/very/long/path" }

Response 201:
{
  "shortUrl": "http://localhost:3000/aB3xZ9",
  "shortCode": "aB3xZ9",
  "originalUrl": "https://example.com/very/long/path"
}
```

---

## Short Code Generation — Counter + Base62

### Why this approach

Auto-increment IDs in Postgres are unique by definition. Encoding that integer
in base62 gives us a short, collision-free code with no extra DB reads.

Alternatives and why we skip them:
- random string → requires collision check on every generation (extra DB read)
- MD5 hash → same URL always produces same code (sharing problem), still collides on truncation
- counter + base62 → no collision possible, no extra reads, deterministic

### Base62 Alphabet

```
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
```

62 characters total: 10 digits + 26 lowercase + 26 uppercase.

### Encoding Algorithm

Convert integer ID to base62, same logic as converting decimal to any base:

```
function encode(id: number): string {
  let result = ''
  while (id > 0) {
    result = ALPHABET[id % 62] + result
    id = Math.floor(id / 62)
  }
  return result
}
```

Example:
```
ID 1     → "1"
ID 61    → "Z"
ID 62    → "10"
ID 3844  → "100"   (62² = 3844)
ID 1342  → "Mq"
```

62^6 = 56,800,235,584 — 56 billion possible codes at 6 characters. More than enough.

### Flow

```
1. validate originalUrl (must be a valid URL)
2. insert row: { originalUrl } → Postgres generates id
3. encode id → shortCode
4. update row: set shortCode = encode(id)
5. return { shortUrl, shortCode, originalUrl }
```

We insert first, get the auto-generated ID, then encode it. This avoids any
pre-generation or collision checking.

---

## URL Validation

Validate before touching the DB. Two checks:

1. is it a string that parses as a valid URL? (use `new URL()`)
2. is the protocol http or https? (reject ftp://, mailto:, etc.)

```typescript
function isValidUrl(input: string): boolean {
  try {
    const url = new URL(input)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
```

---

## Schema (already migrated)

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

`shortCode` has a `@unique` index — fastest possible lookup on the redirect path.

---

## API Contract

### Request

| field        | type   | required | validation                    |
|--------------|--------|----------|-------------------------------|
| originalUrl  | string | yes      | valid http/https URL          |

### Response 201

| field        | type   | description                          |
|--------------|--------|--------------------------------------|
| shortUrl     | string | full short URL with base domain      |
| shortCode    | string | just the code, e.g. "aB3xZ9"        |
| originalUrl  | string | the original URL, echoed back        |

### Error Responses

| status | when                        |
|--------|-----------------------------|
| 400    | missing or invalid URL      |
| 500    | DB write failed             |

---

## Edge Cases

| case                              | handling                                           |
|-----------------------------------|----------------------------------------------------|
| missing `originalUrl` in body     | 400 — "originalUrl is required"                    |
| invalid URL format                | 400 — "invalid URL"                                |
| non-http protocol (ftp://, etc.)  | 400 — "only http/https URLs are allowed"           |
| extremely long URL                | Postgres TEXT has no length limit, fine            |
| same URL shortened twice          | creates two separate rows with different codes     |
| DB down during insert             | Prisma throws, catch it, return 500                |

---

## Trade-offs

**Same URL → different codes each time:**
We don't deduplicate. Two users shortening the same URL get different codes.
Deduplication requires a unique index on `originalUrl` and upsert logic — adds
complexity for a feature most shorteners don't actually need. Skip it for now.

**No custom aliases yet:**
Users can't choose their own short code (e.g. `/my-brand`). That's a separate
feature — it would bypass the counter+base62 system entirely and just validate
the alias is unique before inserting.

**Base URL is hardcoded for now:**
`http://localhost:3000` is the base. In prod this becomes an env var: `BASE_URL`.
Add it to `.env` now so the habit is right.