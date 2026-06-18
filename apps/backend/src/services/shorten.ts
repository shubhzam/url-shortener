import prisma from '../lib/prisma'
import { encode } from '../utils/base62'

// handles the full create flow: insert → encode id → update shortcode
export async function createShortUrl(originalUrl: string): Promise<{
  shortCode: string
  originalUrl: string
}> {
  // insert first to get the auto-generated id
  const url = await prisma.url.create({
    data: {
      originalUrl,
      shortCode: '',
    },
  })

  // encode the id to base62
  const shortCode = encode(url.id)

  // update the row with the generated shortcode
  const updated = await prisma.url.update({
    where: { id: url.id },
    data: { shortCode },
  })

  return {
    shortCode: updated.shortCode,
    originalUrl: updated.originalUrl,
  }
}