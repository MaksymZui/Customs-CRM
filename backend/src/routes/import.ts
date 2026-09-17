import { Router, Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { spawn } from 'child_process'
import prisma from '../lib/prisma'

export const importRouter = Router()

const UPLOAD_DIR = path.join(process.cwd(), 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${uuidv4()}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.originalname.endsWith('.xlsb') || file.originalname.endsWith('.xlsx')) {
      cb(null, true)
    } else {
      cb(new Error('Only .xlsb and .xlsx files are allowed'))
    }
  },
})

importRouter.post('/', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

  const job = await prisma.importJob.create({
    data: {
      id: uuidv4(),
      filename: req.file.originalname,
      status: 'pending',
    },
  })

  const isWindows = process.platform === 'win32'
  const filePath = req.file.path
  const jobId = job.id

  // ВАЖЛИВО: spawn замість exec.
  // exec() буферизує ВЕСЬ stdout/stderr дочірнього процесу в пам'яті
  // Node (родом з maxBuffer, за замовчуванням 1MB, але сам факт
  // буферизації тримає дані в heap, поки процес живий). При
  // ~876k рядків і print() на кожен батч це й давало витік пам'яті
  // в customs-crm backend (спостерігали RSS 3.4GB на процесі,
  // хоча V8 heap лишався малим — витік був саме в native-буферах
  // навколо child_process, не в JS-об'єктах).
  //
  // spawn() зі stdio: 'ignore' взагалі не створює pipe/buffer для
  // виводу дочірнього процесу — Node про нього нічого не знає.
  // detached: true + unref() повністю відв'язують дочірній процес:
  // він продовжує жити і після завершення HTTP-відповіді, і навіть
  // якщо backend перезапуститься.

  let child: ReturnType<typeof spawn>

  if (isWindows) {
    const scriptPath = path.resolve(process.cwd(), '..', 'scripts', 'import_xlsb.py')
    child = spawn('python', [scriptPath, filePath, jobId], {
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL || '' },
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
  } else {
    const wrapperPath = path.resolve(process.cwd(), '..', 'scripts', 'run_import.sh')
    child = spawn('bash', [wrapperPath, filePath, jobId], {
      detached: true,
      stdio: 'ignore',
    })
  }

  // Ловимо лише помилку запуску процесу (напр. файл скрипта не
  // знайдено) — це НЕ підписка на stdout/stderr, витоку не створює.
  child.on('error', (err) => {
    console.error(`Failed to start import process for job ${jobId}:`, err)
    prisma.importJob
      .update({
        where: { id: jobId },
        data: { status: 'error', error: `spawn failed: ${err.message}` },
      })
      .catch(() => {})
  })

  child.unref()

  res.json({ job_id: job.id })
})

importRouter.get('/:jobId/status', async (req: Request, res: Response) => {
  const { jobId } = req.params

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  const interval = setInterval(async () => {
    const job = await prisma.importJob.findUnique({ where: { id: jobId } })
    if (!job) {
      send({ error: 'Job not found' })
      clearInterval(interval)
      res.end()
      return
    }

    send({
      status: job.status,
      processed: job.processed,
      total: job.total_rows,
      error: job.error,
    })

    if (job.status === 'done' || job.status === 'error') {
      clearInterval(interval)
      res.end()
    }
  }, 1000)

  req.on('close', () => clearInterval(interval))
})

importRouter.get('/', async (_req: Request, res: Response) => {
  const jobs = await prisma.importJob.findMany({
    orderBy: { created_at: 'desc' },
    take: 20,
  })
  res.json(jobs)
})