import 'dotenv/config'
import express from 'express'
import prisma from './lib/prisma'
import shortenRouter from './routes/shorten'

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())

// mount routes
app.use('/shorten', shortenRouter)

// health check
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok', db: 'connected' })
  } catch (error) {
    res.status(503).json({ status: 'error', db: 'disconnected' })
  }
})

app.listen(PORT, () => {
  console.log(`server running on port ${PORT}`)
})