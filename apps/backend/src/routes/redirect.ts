import { Router, Request, Response } from 'express'
import { getOriginalUrl, incrementClickCount } from '../services/redirect'

const router = Router()

// GET /:code - redirects to the original url
router.get('/:code', async (req: Request, res: Response) => {
  const { code } = req.params

  if (!code || Array.isArray(code)) {
    res.status(400).json({ error: 'invalid code' })
    return
  }

  try {
    const originalUrl = await getOriginalUrl(code)

    if (!originalUrl) {
      res.status(404).json({ error: 'short URL not found' })
      return
    }

    incrementClickCount(code)

    res.redirect(302, originalUrl)
  } catch (error) {
    console.error('redirect failed:', error)
    res.status(500).json({ error: 'internal server error' })
  }
})

export default router