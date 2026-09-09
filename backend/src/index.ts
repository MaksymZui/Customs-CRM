import express from 'express'
import cors from 'cors'
import { declarationsRouter } from './routes/declarations'
import { importRouter } from './routes/import'
import { statsRouter } from './routes/stats'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())

app.use('/api/declarations', declarationsRouter)
app.use('/api/import', importRouter)
app.use('/api/stats', statsRouter)

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})