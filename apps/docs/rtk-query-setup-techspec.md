# rtk-query-setup — Technical Spec

## Problem

Frontend needs to call `POST /shorten` on the backend and handle three states:
idle, loading, success, error. We need this to work the "right" way for this
stack — through Redux Toolkit + RTK Query — not via a raw `fetch()` in a
component, because that's the whole reason RTK Query is in the stack.

This is the first frontend feature. Everything after this (future GET /urls list,
auth, etc.) builds on the pattern set here.

---

## Why RTK Query instead of fetch-in-useEffect or plain Redux

Plain Redux for API calls means hand-writing: a loading flag, an error flag, a
data field, three action types (pending/fulfilled/rejected), a thunk, and a
reducer — for every single endpoint. RTK Query generates all of that from one
endpoint definition.

`createApi` takes an endpoint description and generates:
- a hook (`useShortenUrlMutation`) with built-in loading/error/data state
- automatic request dedup and caching (irrelevant for a POST, very relevant later
  for GET /urls)
- a slice reducer wired into the store automatically — you don't write a reducer

The cost: one-time setup (store config, provider, base api slice). That setup
happens once in this feature and pays off on every endpoint added after.

---

## Architecture Decision: One API Slice

`createApi` is meant to be called **once per base URL**, with endpoints added
over time via `injectEndpoints`. This is the documented Redux Toolkit pattern,
not a project-specific simplification.

Why not one `createApi` per feature:
- each `createApi` call creates its own reducer path and its own cache — you'd
  lose shared tag-based cache invalidation across features
- there's one backend (`localhost:3000`), so there's no technical reason to
  split

For now, the single endpoint lives directly in the base api file. When `GET /urls`
is built (a second feature), I'll show you `injectEndpoints` to split endpoints
into feature folders without creating a second `api` instance. Not doing that
split now — there's nothing to split yet.

---

## Mutation vs Query

RTK Query has two endpoint types:

| type     | use for          | trigger                    | caching                      |
|----------|------------------|----------------------------|---------------------------   |
| query    | GET / read       | auto-fires on mount        | cached, auto-refetch         |
| mutation | POST/PUT/DELETE  | called explicitly (button) | not cached, invalidates tags |

`POST /shorten` is a mutation: it's a write, it has side effects, and it should
only fire when the user submits the form — not automatically on render.

---

## File Structure

```
apps/frontend/src/
  store/
    api.ts           ← base api slice, createApi + fetchBaseQuery + shortenUrl mutation
    store.ts          ← configureStore, wires api reducer + middleware
    hooks.ts           ← typed useAppDispatch / useAppSelector (skip for now — no slices need it yet, just RTK Query hooks)
  app/
    providers.tsx       ← <Provider store={store}> wrapper (Next.js App Router needs this as a client component)
    layout.tsx           ← existing Next.js layout, wraps children in providers.tsx
  components/
    ShortenForm.tsx       ← the form, uses useShortenUrlMutation hook
```

---

## API Contract (consumed, not owned — this is the backend's existing contract)

```
POST http://localhost:3000/shorten
Body: { originalUrl: string }

201 → { shortUrl: string, shortCode: string, originalUrl: string }
400 → { error: string }   (missing field, or invalid URL/protocol)
500 → { error: string }
```

RTK Query's `fetchBaseQuery` returns errors in a `FetchBaseQueryError` shape —
`{ status: number, data: unknown }`. We'll type `data` as `{ error: string }` to
match the backend contract, with a guard since `data` is `unknown` by default.

---

## Why fetchBaseQuery and Not axios

`fetchBaseQuery` is RTK Query's built-in wrapper around the native `fetch` API.
It integrates with RTK Query's caching/tagging directly — no adapter needed.
axios works too (RTK Query supports a custom `baseQuery`), but adds a dependency
for something the platform already provides. Default to `fetchBaseQuery` unless
you hit a real limitation (there isn't one here).

---

## Environment Variable: API Base URL

Don't hardcode `http://localhost:3000` in `api.ts`. Next.js needs client-side env
vars prefixed `NEXT_PUBLIC_`:

```
# apps/frontend/.env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
```

`.env.local` is git-ignored by Next.js convention by default — confirm
`.gitignore` has it. We'll also add `.env.local.example` with the placeholder,
same pattern as backend's `.env.example`.

---

## State Shape After Setup

```typescript
// what useShortenUrlMutation() returns
const [shortenUrl, { data, error, isLoading }] = useShortenUrlMutation()

// data   → { shortUrl, shortCode, originalUrl } | undefined
// error  → FetchBaseQueryError | SerializedError | undefined
// isLoading → boolean, true only while the request is in flight
```

No manual `useState` for loading/error — RTK Query owns this state.

---

## Edge Cases

| case                              | handling                                                  |
|------------------------------------|------------------------------------------------------------|
| empty input submitted               | client-side guard before calling mutation — don't waste a 400 round trip |
| backend returns 400 (invalid URL)   | show `error.data.error` message from response body          |
| backend returns 500                 | show generic "something went wrong" — don't leak internals  |
| backend unreachable (Docker down)   | `fetchBaseQuery` returns a `FETCH_ERROR` status — show "can't reach server" |
| user double-clicks submit           | `isLoading` disables the button while in flight              |
| user submits same URL twice         | backend creates two separate rows by design (see shorten-url-techspec.md) — frontend doesn't dedupe either |

---

## Trade-offs

**Single api.ts file for now:** will need to split via `injectEndpoints` once a
second feature (GET /urls) exists. Documented above — deliberate, not a shortcut
we're hiding.

**No `RTK Query tags` (`providesTags`/`invalidatesTags`) yet:** tags exist to
auto-refetch a `query` after a `mutation` changes related data — e.g. creating a
URL should refetch the URL list. We don't have a list endpoint yet, so there's
nothing to invalidate. Will introduce tags when GET /urls exists — it's the
canonical use case for them.

**Client-side URL validation duplicates backend validation:** we'll do a light
check (non-empty, looks like it has a protocol) before submitting, but the
backend remains the source of truth for "is this actually valid." This isn't
redundant — it's UX (fail fast) vs correctness (backend can't trust the client).
