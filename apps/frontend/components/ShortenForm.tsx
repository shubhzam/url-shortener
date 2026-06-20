'use client'

import { useState, type FormEvent } from 'react'
import { useShortenUrlMutation } from '../store/api'

// type guard for rtk query's error shape - status can be a number (real http
// status from the backend) or one of a few string literals like 'FETCH_ERROR'
// when fetch() itself never got a response. these need different handling,
// see rtk-query-setup-dataflow.md "Backend Unreachable" lifecycle for why
function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'status' in error) {
    const err = error as { status: number | string; data?: { error?: string } }

    if (err.status === 'FETCH_ERROR') {
      return "can't reach the server - is it running?"
    }
    if (typeof err.status === 'number' && err.data?.error) {
      return err.data.error
    }
  }
  return 'something went wrong'
}

export function ShortenForm() {
  const [originalUrl, setOriginalUrl] = useState('')
  const [shortenUrl, { data, error, isLoading }] = useShortenUrlMutation()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    // client-side guard - don't waste a round trip on an empty input,
    // backend remains the source of truth for actual url validity
    if (!originalUrl.trim()) {
      return
    }

    shortenUrl({ originalUrl })
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={originalUrl}
          onChange={(e) => setOriginalUrl(e.target.value)}
          placeholder="https://example.com/very/long/path"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          {isLoading ? 'Shortening...' : 'Shorten'}
        </button>
      </form>

      {data && (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm">
          <a
            href={data.shortUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-green-700 underline"
          >
            {data.shortUrl}
          </a>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {getErrorMessage(error)}
        </div>
      )}
    </div>
  )
}