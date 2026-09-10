import express from 'express'
import cors from 'cors'
import { declarationsRouter } from './routes/declarations'
import { importRouter } from './routes/import'
import { statsRouter } from './routes/stats'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: 'http://localhost:5173' }))

// Збільшуємо лімити для великих JSON-запитів (якщо вони є)
app.use(express.json({ limit: '500mb' }))
app.use(express.urlencoded({ limit: '500mb', extended: true }))

app.use('/api/declarations', declarationsRouter)
app.use('/api/import', importRouter)
app.use('/api/stats', statsRouter)

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// Зберігаємо інстанс сервера, щоб встановити таймаут 10 хвилин для великих файлів
const server = app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})

app.post('/api/login', (req, res) => {
  const { username, password } = req.body
  
  const validUser = process.env.ADMIN_USER || 'admin'
  const validPass = process.env.ADMIN_PASSWORD || 'admin123'

  if (username === validUser && password === validPass) {
    res.json({ success: true })
  } else {
    res.status(401).json({ success: false, message: 'Невірний логін або пароль' })
  }
})

server.setTimeout(600000) // 10 хвилин (600 000 мс)