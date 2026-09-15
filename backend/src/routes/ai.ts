import { Router, Request, Response } from 'express'
import { createHash } from 'crypto'
import { GoogleGenerativeAI } from '@google/generative-ai'
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
  
  const parsed: ParsedItem[] = JSON.parse(clean)
  return parsed
}

aiRouter.post('/analyze-uktved', async (req: Request, res: Response) => {
  try {
    let { code, importId = 'latest', date_from, date_to } = req.body as Record<string, string>

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
    if (date_from || date_to) {
      where.declaration_date = {
        ...(date_from ? { gte: parseExcelDate(date_from) } : {}),
        ...(date_to ? { lte: parseExcelDate(date_to) } : {}),
      }
    }

    // Отримуємо унікальні product_name
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

    // Перевіряємо які вже є в кеші
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

    // Обробляємо нові через Gemini батчами по 15
    const BATCH = 15
    for (let i = 0; i < toProcess.length; i += BATCH) {
      const batch = toProcess.slice(i, i + BATCH)
      const names = batch.map(b => b.name)

      try {
        const parsed = await parseWithGemini(names)

        // Групуємо результати по index
        const byIndex = new Map<number, ParsedItem[]>()
        for (const item of parsed) {
          if (!byIndex.has(item.index)) byIndex.set(item.index, [])
          byIndex.get(item.index)!.push(item)
        }

        // Зберігаємо в кеш
        for (let j = 0; j < batch.length; j++) {
          const batchItem = batch[j]
          const items = byIndex.get(j) || [{ index: j, brand: null, model: null, qty: null, unit: null }]

          // Спочатку видаляємо старі записи для цього хешу
          await prisma.aiCache.deleteMany({ where: { product_hash: batchItem.hash } })

          // Зберігаємо всі моделі
          await prisma.aiCache.createMany({
            data: items.map(item => ({
              product_hash: batchItem.hash,
              product_name: batchItem.name,
              brand: item.brand,
              model: item.model,
              qty: item.qty,
              unit: item.unit,
            })),
          })
        }
      } catch (err) {
        console.error('Gemini batch error:', err)
      }
    }

    // Агрегуємо результати через JOIN
    const importFilter = importId && importId !== 'all' ? `AND d.import_id = '${importId}'` : ''
    const dateFromFilter = date_from ? `AND d.declaration_date >= ${parseExcelDate(date_from)}` : ''
    const dateToFilter = date_to ? `AND d.declaration_date <= ${parseExcelDate(date_to)}` : ''

    const aggRows = await prisma.$queryRawUnsafe<{
      brand: string | null
      model: string | null
      count: bigint
      total_qty: number | null
      total_weight: number | null
      total_value_usd: number | null
    }[]>(`
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
      WHERE d.product_code LIKE '${code}%'
        ${importFilter}
        ${dateFromFilter}
        ${dateToFilter}
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
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

function parseExcelDate(val: string): number {
  if (val.includes('-')) {
    const d = new Date(val)
    const excelEpoch = new Date(1899, 11, 30)
    return Math.floor((d.getTime() - excelEpoch.getTime()) / 86400000)
  }
  return parseFloat(val)
}