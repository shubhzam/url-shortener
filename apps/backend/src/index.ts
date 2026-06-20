import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import prisma from './lib/prisma'
import shortenRouter from './routes/shorten'
import redirectRouter from './routes/redirect'

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())
app.use(cors({
  origin: 'http://localhost:3001', // your frontend's origin, not a wildcard
}))
app.use('/shorten', shortenRouter)
app.use('/', redirectRouter)

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