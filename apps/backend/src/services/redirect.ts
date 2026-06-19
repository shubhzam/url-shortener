import prisma from '../lib/prisma'
import redis from '../lib/redis'

const CACHE_TTL_SECONDS = 86400 // 24 hours

// looks up the original url for a short code - checks redis first, falls back to db
export async function getOriginalUrl(shortCode: string): Promise<string | null> {
  const cacheKey = `url:${shortCode}`

  // check redis first
  const cached = await redis.get(cacheKey)
  if (cached) {
    return cached
  }

  // cache miss - hit the db
  const url = await prisma.url.findUnique({
    where: { shortCode },
  })

  if (!url) {
    return null
  }

  // check expiry
  if (url.expiresAt && url.expiresAt < new Date()) {
    await redis.del(cacheKey)
    return null
  }

  // populate cache for next time
  await redis.set(cacheKey, url.originalUrl, 'EX', CACHE_TTL_SECONDS)

  return url.originalUrl
}

// increments click count - fire and forget, caller doesn't await this
export function incrementClickCount(shortCode: string): void {
  prisma.url
    .update({
      where: { shortCode },
      data: { clickCount: { increment: 1 } },
    })
    .catch((err) => console.error(`click count update failed for ${shortCode}:`, err))
}