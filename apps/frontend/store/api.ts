import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

// matches the backend's actual response shape from POST /shorten
// see shorten-url-techspec.md for the source of truth on this contract
export interface ShortenUrlResponse {
  shortUrl: string
  shortCode: string
  originalUrl: string
}

export interface ShortenUrlRequest {
  originalUrl: string
}

// one api slice for the whole app, per rtk query convention - more endpoints
// get injected into this same instance later instead of creating new createApi calls
export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
  }),
  endpoints: (builder) => ({
    shortenUrl: builder.mutation<ShortenUrlResponse, ShortenUrlRequest>({
      query: (body) => ({
        url: '/shorten',
        method: 'POST',
        body,
      }),
    }),
  }),
})

// rtk query auto-generates this hook name from the endpoint key "shortenUrl"
export const { useShortenUrlMutation } = api