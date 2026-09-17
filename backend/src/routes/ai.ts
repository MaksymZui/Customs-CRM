import { Router, Request, Response } from 'express'
import { createHash } from 'crypto'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'

export const aiRouter = Router()

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')
const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' })

function hashText(text: string): string {
  return createHash('md5').update(text).digest('hex')
}

interface ParsedItem {
  index: number
  brand: string | null
  model: string | null
  qty: number | null
  unit: string | null
}

async function parseWithGemini(productNames: string[]): Promise<ParsedItem[]> {
  const prompt = `Ти експерт з аналізу митних декларацій України. Проаналізуй кожен запис і витягни структуровану інформацію.

ПРАВИЛА:
- Якщо в одному записі кілька моделей — створи ОКРЕМИЙ об'єкт для КОЖНОЇ моделі з тим самим index
- Бренд шукай скрізь: після "ТОРГОВЕЛЬНА МАРКА", "ВИРОБНИК", "BRAND", або відома компанія в тексті (CADDX, DJI, SONY, HIKVISION, DAHUA, FLIR, AXIS, PILOTIX, OPTITHERM тощо)
- Модель — будь-який буквено-цифровий код схожий на артикул, або назва після бренду
- Кількість — число перед ШТ, PCS, КОМПЛ, ШТУК (для кожної моделі окремо якщо вказано)
- Якщо не можеш визначити поле — null
- Поверни ТІЛЬКИ валідний JSON масив без markdown, без пояснень

Формат відповіді:
[{"index": 0, "brand": "CADDX", "model": "RATEL PRO", "qty": 1000, "unit": "шт"}, {"index": 0, "brand": "CADDX", "model": "ECLIPSE009", "qty": 500, "unit": "шт"}, {"index": 1, "brand": "DJI", "model": null, "qty": 10, "unit": "шт"}]

Записи для аналізу:
${productNames.map((name, i) => `${i}. ${name.substring(0, 800)}`).join('\n')}
`

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  
  try {
    const parsed: ParsedItem[] = JSON.parse(clean)
    return parsed
  } catch (e) {
    console.error('Failed to parse Gemini response JSON:', clean)
    return []
  }
}

aiRouter.post('/analyze-uktved', async (req: Request, res: Response) => {
  try {
    let { code, importId = 'latest', date_from, date_to, recipient_code } = req.body as Record<string, string>

    if (!code) return res.status(400).json({ error: 'code is required' })

    if (!importId || importId === 'latest') {
      const latestJob = await prisma.importJob.findFirst({
        where: { status: 'done' },
        orderBy: { created_at: 'desc' },
      })
      importId = latestJob ? latestJob.id : ''
    }

    const where: Record<string, unknown> = {
      product_code: { startsWith: code },
      product_name: { not: null },
    }
    if (importId && importId !== 'all') where.import_id = importId
    if (recipient_code && !isNaN(parseFloat(recipient_code))) {
      where.recipient_code = parseFloat(recipient_code)
    }
    if (date_from || date_to) {
      where.declaration_date = {
        ...(date_from ? { gte: parseExcelDate(date_from) } : {}),
        ...(date_to ? { lte: parseExcelDate(date_to) } : {}),
      }
    }

    const rows = await prisma.declaration.findMany({
      where,
      select: { product_name: true },
      distinct: ['product_name'],
      take: 100,
    })

    const uniqueNames = rows.map(r => r.product_name).filter(Boolean) as string[]
    if (uniqueNames.length === 0) {
      return res.json({ results: [], cached: 0, new: 0 })
    }

    const hashes = uniqueNames.map(n => hashText(n))

    const cached = await prisma.aiCache.findMany({
      where: { product_hash: { in: hashes } },
    })
    const cachedHashes = new Set(cached.map(c => c.product_hash))

    const toProcess: { name: string; hash: string; localIndex: number }[] = []
    for (let i = 0; i < uniqueNames.length; i++) {
      if (!cachedHashes.has(hashes[i])) {
        toProcess.push({ name: uniqueNames[i], hash: hashes[i], localIndex: toProcess.length })
      }
    }

    // Обработка пакетами по 15 штук
    const BATCH = 15
    for (let i = 0; i < toProcess.length; i += BATCH) {
      const batch = toProcess.slice(i, i + BATCH)
      const names = batch.map(b => b.name)

      try {
        const parsed = await parseWithGemini(names)

        const byIndex = new Map<number, ParsedItem[]>()
        for (const item of parsed) {
          if (!byIndex.has(item.index)) byIndex.set(item.index, [])
          byIndex.get(item.index)!.push(item)
        }

        // Формируем единый батч данных для записи
        const recordsToInsert: any[] = []
        const hashesToDelete: string[] = []

        for (let j = 0; j < batch.length; j++) {
          const batchItem = batch[j]
          const items = byIndex.get(j) || [{ index: j, brand: null, model: null, qty: null, unit: null }]

          hashesToDelete.push(batchItem.hash)

          for (const item of items) {
            recordsToInsert.push({
              product_hash: batchItem.hash,
              product_name: batchItem.name,
              brand: item.brand,
              model: item.model,
              qty: item.qty,
              unit: item.unit,
            })
          }
        }

        // Пакетное удаление и пакетная вставка (экономит подключения и память)
        if (hashesToDelete.length > 0) {
          await prisma.aiCache.deleteMany({ where: { product_hash: { in: hashesToDelete } } })
        }
        if (recordsToInsert.length > 0) {
          await prisma.aiCache.createMany({ data: recordsToInsert })
        }
      } catch (err) {
        console.error('Gemini batch error:', err)
      }
    }

    // Безопасный SQL-запрос через Prisma.sql
    const parsedRecipient = recipient_code ? parseFloat(recipient_code) : null
    const parsedDateFrom = date_from ? parseExcelDate(date_from) : null
    const parsedDateTo = date_to ? parseExcelDate(date_to) : null

    const aggRows = await prisma.$queryRaw<{
      brand: string | null
      model: string | null
      count: bigint
      total_qty: number | null
      total_weight: number | null
      total_value_usd: number | null
    }[]>(Prisma.sql`
      SELECT
        ac.brand,
        ac.model,
        COUNT(DISTINCT d.id) as count,
        SUM(
          CASE WHEN ac.qty IS NOT NULL THEN ac.qty
               ELSE d.add_unit_qty END
        ) as total_qty,
        SUM(d.weight_net) as total_weight,
        SUM(d.invoice_value_usd) as total_value_usd
      FROM declarations d
      JOIN ai_cache ac ON md5(d.product_name) = ac.product_hash
      WHERE d.product_code LIKE ${code + '%'}
        ${importId && importId !== 'all' ? Prisma.sql`AND d.import_id = ${importId}` : Prisma.empty}
        ${parsedRecipient ? Prisma.sql`AND d.recipient_code = ${parsedRecipient}` : Prisma.empty}
        ${parsedDateFrom ? Prisma.sql`AND d.declaration_date >= ${parsedDateFrom}` : Prisma.empty}
        ${parsedDateTo ? Prisma.sql`AND d.declaration_date <= ${parsedDateTo}` : Prisma.empty}
        AND d.product_name IS NOT NULL
      GROUP BY ac.brand, ac.model
      ORDER BY total_value_usd DESC NULLS LAST
      LIMIT 200
    `)

    res.json({
      results: aggRows.map(r => ({
        brand: r.brand || '—',
        model: r.model || '—',
        count: Number(r.count),
        total_qty: r.total_qty ? Number(r.total_qty) : null,
        total_weight: r.total_weight ? Number(r.total_weight) : null,
        total_value_usd: r.total_value_usd ? Number(r.total_value_usd) : null,
      })),
      cached: cachedHashes.size,
      new: toProcess.length,
    })
  } catch (err) {
    console.error('Error analyzing UKTVED:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

function parseExcelDate(val: string): number {
  if (val.includes('-')) {
    const d = new Date(val)
    const excelEpoch = new Date(1899, 11, 30)
    return Math.floor((d.getTime() - excelEpoch.getTime()) / 86400000)
  }
  return parseFloat(val) || 0
}