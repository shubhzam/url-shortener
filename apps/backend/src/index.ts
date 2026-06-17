import express from 'express'

const app = express()
const PORT = process.env.PORT || 3000

// parse incoming json request bodies
app.use(express.json())

// health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.listen(PORT, () => {
  console.log(`server running on port ${PORT}`)
})