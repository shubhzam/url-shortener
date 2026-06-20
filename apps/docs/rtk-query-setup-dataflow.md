# rtk-query-setup — Data Flow

## Service Map

```
Browser
   │
   │ user types URL, clicks submit
   ▼
┌──────────────────────────────┐
│   ShortenForm.tsx              │
│   (React component)            │
│                                │
│  const [shortenUrl, state] =   │
│    useShortenUrlMutation()     │
│                                │
│  onSubmit → shortenUrl({...})  │
└────────────┬───────────────────┘
             │
             ▼
┌──────────────────────────────┐
│   RTK Query (api.ts)            │
│                                │
│  1. dispatch mutation action    │
│  2. isLoading → true            │
│  3. fetchBaseQuery sends         │
│     fetch(POST /shorten)         │
└────────────┬───────────────────┘
             │
             │ HTTP POST
             ▼
┌──────────────────────────────┐
│   Backend (apps/backend)        │
│   already built, see              │
│   shorten-url-techspec.md         │
└────────────┬───────────────────┘
             │
             │ HTTP 201 / 400 / 500
             ▼
┌─────────────────────────────--─┐
│   RTK Query (api.ts)           │
│                                │
│  4. response arrives           │
│  5. isLoading → false          │
│  6. data OR error populated    │
│  7. redux store updated        │
└────────────┬───────────────────┘
             │
             │ re-render (useSelector under the hood)
             ▼
┌──────────────────────────────┐
│   ShortenForm.tsx                │
│   reads { data, error,            │
│           isLoading } and          │
│   renders accordingly               │
└──────────────────────────────┘
```

---

## Request Lifecycle — Happy Path

```
1. USER
   types "https://example.com/very/long/path" into input
   clicks "Shorten"

2. COMPONENT (ShortenForm.tsx)
   → onSubmit handler fires
   → client-side guard: input is non-empty
   → calls: shortenUrl({ originalUrl: input })
            ↳ this is the trigger function from useShortenUrlMutation()

3. RTK QUERY
   → dispatches an internal redux action
   → store updates: { isLoading: true, data: undefined, error: undefined }
   → component re-renders, button disables, shows "Shortening..."

4. RTK QUERY (fetchBaseQuery)
   → fetch('http://localhost:3000/shorten', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ originalUrl: input })
     })

5. BACKEND
   processes request — see shorten-url-dataflow.md for full backend lifecycle
   returns 201 { shortUrl, shortCode, originalUrl }

6. RTK QUERY
   → receives response
   → store updates: { isLoading: false, data: { shortUrl, shortCode, originalUrl }, error: undefined }
   → component re-renders

7. COMPONENT
   → reads data.shortUrl
   → displays "Your short URL: http://localhost:3000/Mq"
```

---

## Request Lifecycle — Validation Error (400)

```
1-4. same as happy path, but originalUrl = "not-a-url"

5. BACKEND
   → new URL("not-a-url") throws
   → returns 400 { error: "invalid URL" }

6. RTK QUERY
   → store updates: {
       isLoading: false,
       data: undefined,
       error: { status: 400, data: { error: "invalid URL" } }
     }

7. COMPONENT
   → checks error
   → narrows error.data to { error: string } (type guard, see techspec)
   → displays "invalid URL" to the user
```

---

## Request Lifecycle — Backend Unreachable

```
1-4. same as happy path, but Docker / npm run dev is not running

5. fetch() itself fails — no response at all (connection refused)

6. RTK QUERY
   → store updates: {
       isLoading: false,
       data: undefined,
       error: { status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' }
     }

7. COMPONENT
   → error.status is the string 'FETCH_ERROR', not a number — different shape
     than the 400 case, needs a separate check
   → displays "can't reach the server — is it running?"
```

This is why the techspec has a type guard on the error shape — `status` can be
a number (HTTP status) or a string literal like `'FETCH_ERROR'` / `'PARSING_ERROR'`.
Treating it as always-a-number will produce a TypeScript error and, if you cast
around it, a runtime bug.

---

## Store Wiring (one-time setup, happens before any request)

```
1. store.ts
   configureStore({
     reducer: { [api.reducerPath]: api.reducer },
     middleware: (getDefault) => getDefault().concat(api.middleware)
   })
   ↳ api.middleware enables caching, invalidation, polling — without it,
     RTK Query hooks don't actually fetch anything

2. providers.tsx (client component — Next.js App Router specific)
   <Provider store={store}>{children}</Provider>
   ↳ must be a separate 'use client' file — layout.tsx itself can stay a
     server component, it just renders <Providers> around children

3. layout.tsx
   <Providers>{children}</Providers>
```

Order matters: store must exist before Provider wraps the app, Provider must
wrap the app before any component calls a generated hook like
`useShortenUrlMutation`.

---

## File Structure After This Feature

```
apps/frontend/src/
  store/
    api.ts              ← createApi, fetchBaseQuery, shortenUrl mutation endpoint
    store.ts             ← configureStore
  app/
    providers.tsx          ← 'use client', wraps children in <Provider>
    layout.tsx               ← existing, now renders <Providers>
  components/
    ShortenForm.tsx            ← form UI, calls useShortenUrlMutation()
```

---

## Environment Variables Used

```
NEXT_PUBLIC_API_BASE_URL   → api.ts → fetchBaseQuery's baseUrl
```
