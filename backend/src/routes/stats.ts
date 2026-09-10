import { Router, Request, Response } from 'express'
import prisma from '../lib/prisma'
import { Prisma } from '@prisma/client'

export const statsRouter = Router()

statsRouter.get('/', async (req: Request, res: Response) => {
  try {
    let { importId = 'latest' } = req.query as Record<string, string>

    if (!importId || importId === 'latest') {
      const latestJob = await prisma.importJob.findFirst({
        orderBy: { created_at: 'desc' },
      })
      importId = latestJob ? latestJob.id : ''
    }

    const where: Record<string, unknown> = {}
    if (importId && importId !== 'all') {
      where.import_id = importId
    }

    const importFilter = (importId && importId !== 'all')
      ? Prisma.sql`AND import_id = ${importId}`
      : Prisma.sql``

    const [totals, topRecipients, topCountries, topProducts] = await Promise.all([
      prisma.declaration.aggregate({
        where,
        _count: { id: true },
        _sum: {
          invoice_value_usd: true,
          customs_value_usd: true,
          duty_uah: true,
          vat_uah: true,
          weight_net: true,
        },
      }),
      prisma.$queryRaw<{ name: string; total: number }[]>`
        SELECT recipient_name as name, SUM(customs_value_usd) as total
        FROM declarations
        WHERE recipient_name IS NOT NULL AND recipient_name != ''
        ${importFilter}
        GROUP BY recipient_name
        ORDER BY total DESC
        LIMIT 10
      `,
      prisma.$queryRaw<{ name: string; total: number }[]>`
        SELECT origin_country as name, SUM(customs_value_usd) as total
        FROM declarations
        WHERE origin_country IS NOT NULL AND origin_country != ''
        ${importFilter}
        GROUP BY origin_country
        ORDER BY total DESC
        LIMIT 10
      `,
      prisma.$queryRaw<{ code: string; total: number; count: number }[]>`
        SELECT LEFT(product_code, 4) as code,
               SUM(customs_value_usd) as total,
               COUNT(*) as count
        FROM declarations
        WHERE product_code IS NOT NULL AND product_code != ''
        ${importFilter}
        GROUP BY LEFT(product_code, 4)
        ORDER BY total DESC
        LIMIT 10
      `,
    ])

    res.json({
      totals: {
        declarations: Number(totals._count.id),
        invoice_usd: Number(totals._sum.invoice_value_usd || 0),
        customs_usd: Number(totals._sum.customs_value_usd || 0),
        duty_uah: Number(totals._sum.duty_uah || 0),
        vat_uah: Number(totals._sum.vat_uah || 0),
        weight_net_kg: Number(totals._sum.weight_net || 0),
      },
      top_recipients: topRecipients.map(r => ({ name: r.name, total: Number(r.total) })),
      top_countries: topCountries.map(r => ({ name: r.name, total: Number(r.total) })),
      top_products: topProducts.map(r => ({ code: r.code, total: Number(r.total), count: Number(r.count) })),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})