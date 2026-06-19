import Redis from 'ioredis'

// single redis instance for the whole app - same pattern as prisma singleton
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

redis.on('connect', () => console.log('redis connected'))
redis.on('error', (err) => console.error('redis error:', err))

export default redis