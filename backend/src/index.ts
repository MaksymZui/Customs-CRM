import express from 'express'
import cors from 'cors'
import { declarationsRouter } from './routes/declarations'
import { importRouter } from './routes/import'
import { statsRouter } from './routes/stats'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json({ limit: '500mb' }))
app.use(express.urlencoded({ limit: '500mb', extended: true }))

app.use('/api/declarations', declarationsRouter)
app.use('/api/import', importRouter)
app.use('/api/stats', statsRouter)

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