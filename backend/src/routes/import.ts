import { Router, Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { spawn } from 'child_process'
import prisma from '../lib/prisma'

export const importRouter = Router()

let jobsCache: any = null
let lastJobsFetch = 0

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

  try {
    const job = await prisma.importJob.create({
      data: {
        id: uuidv4(),
        filename: req.file.originalname,
        status: 'pending',
      },
    })

    jobsCache = null

    const isWindows = process.platform === 'win32'
    const filePath = req.file.path
    const jobId = job.id

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
  } catch (err) {
    console.error('Error creating import job:', err)
    res.status(500).json({ error: 'Failed to initialize import job' })
  }
})

importRouter.get('/:jobId/status', async (req: Request, res: Response) => {
  const { jobId } = req.params

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  let isChecking = false

  const send = (data: object) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    }
  }

  const interval = setInterval(async () => {
    if (isChecking || res.writableEnded) return
    isChecking = true

    try {
      const job = await prisma.importJob.findUnique({
        where: { id: jobId },
        select: {
          status: true,
          processed: true,
          total_rows: true,
          error: true,
        },
      })

      if (!job) {
        send({ error: 'Job not found' })
        cleanup()
        return
      }

      send({
        status: job.status,
        processed: job.processed,
        total: job.total_rows,
        error: job.error,
      })

      if (job.status === 'done' || job.status === 'error') {
        cleanup()
      }
    } catch (e) {
      cleanup()
    } finally {
      isChecking = false
    }
  }, 2500)

  const timeout = setTimeout(() => {
    cleanup()
  }, 30 * 60 * 1000)

  function cleanup() {
    clearInterval(interval)
    clearTimeout(timeout)
    if (!res.writableEnded) {
      res.end()
    }
  }

  req.on('close', cleanup)
})

importRouter.get('/', async (_req: Request, res: Response) => {
  try {
    if (jobsCache && Date.now() - lastJobsFetch < 5000) {
      return res.json(jobsCache)
    }

    const jobs = await prisma.importJob.findMany({
      orderBy: { created_at: 'desc' },
      take: 20,
    })

    jobsCache = jobs
    lastJobsFetch = Date.now()
    res.json(jobs)
  } catch (err) {
    console.error('Error fetching import jobs:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})