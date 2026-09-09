import { Router, Request, Response } from 'express'
import prisma from '../lib/prisma'

export const statsRouter = Router()

statsRouter.get('/', async (_req: Request, res: Response) => {
  const [totals, topRecipients, topCountries, topProducts] = await Promise.all([
    prisma.declaration.aggregate({
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
      GROUP BY recipient_name
      ORDER BY total DESC
      LIMIT 10
    `,
    prisma.$queryRaw<{ name: string; total: number }[]>`
      SELECT origin_country as name, SUM(customs_value_usd) as total
      FROM declarations
      WHERE origin_country IS NOT NULL AND origin_country != ''
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
      GROUP BY LEFT(product_code, 4)
      ORDER BY total DESC
      LIMIT 10
    `,
  ])

 res.json({
    totals: {
      declarations: Number(totals._count.id),
      invoice_usd: Number(totals._sum.invoice_value_usd),
      customs_usd: Number(totals._sum.customs_value_usd),
      duty_uah: Number(totals._sum.duty_uah),
      vat_uah: Number(totals._sum.vat_uah),
      weight_net_kg: Number(totals._sum.weight_net),
    },
    top_recipients: topRecipients.map(r => ({ name: r.name, total: Number(r.total) })),
    top_countries: topCountries.map(r => ({ name: r.name, total: Number(r.total) })),
    top_products: topProducts.map(r => ({ code: r.code, total: Number(r.total), count: Number(r.count) })),
  })
})