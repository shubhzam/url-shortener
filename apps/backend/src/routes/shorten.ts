import { Router, Request, Response } from 'express'
import { createShortUrl } from '../services/shorten'
import { isValidUrl } from '../utils/validateUrl'

const router = Router()

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

// POST /shorten - takes a long url and returns a short one
router.post('/', async (req: Request, res: Response) => {
  const { originalUrl } = req.body

  if (!originalUrl) {
    res.status(400).json({ error: 'originalUrl is required' })
    return
  }

  if (!isValidUrl(originalUrl)) {
    res.status(400).json({ error: 'invalid URL - must be http or https' })
    return
  }

  try {
    const { shortCode, originalUrl: original } = await createShortUrl(originalUrl)
    res.status(201).json({
      shortUrl: `${BASE_URL}/${shortCode}`,
      shortCode,
      originalUrl: original,
    })
  } catch (error) {
    console.error('failed to create short url:', error)
    res.status(500).json({ error: 'internal server error' })
  }
})

export default router