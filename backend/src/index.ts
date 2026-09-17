import express from 'express'
import cors from 'cors'
import prisma from './lib/prisma'
import { declarationsRouter } from './routes/declarations'
import { importRouter } from './routes/import'
import { statsRouter } from './routes/stats'
import { analyticsRouter } from './routes/analytics'
import { aiRouter } from './routes/ai'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: '*' }))
app.use(express.json({ limit: '500mb' }))
app.use(express.urlencoded({ limit: '500mb', extended: true }))

app.use('/api/declarations', declarationsRouter)
app.use('/api/import', importRouter)
app.use('/api/stats', statsRouter)
app.use('/api/analytics', analyticsRouter)
app.use('/api/ai', aiRouter)

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.post('/api/login', (req, res) => {
  const { username, password } = req.body
  const validUser = process.env.ADMIN_USER
  const validPass = process.env.ADMIN_PASSWORD

  if (!validUser || !validPass) {
    return res.status(500).json({ success: false, message: 'Server misconfigured' })
  }

  if (username === validUser && password === validPass) {
    res.json({ success: true })
  } else {
    res.status(401).json({ success: false, message: 'Невірний логін або пароль' })
  }
})

const server = app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})

server.setTimeout(600000)

// Корректное завершение работы (Graceful Shutdown) для освобождения пула PostgreSQL
const shutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}. Closing HTTP server and Prisma client...`)
  server.close(async () => {
    await prisma.$disconnect()
    console.log('PostgreSQL pool disconnected. Server shut down cleanly.')
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))