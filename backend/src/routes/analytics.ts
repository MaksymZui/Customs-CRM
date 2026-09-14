import { Router, Request, Response } from 'express'
import prisma from '../lib/prisma'

export const analyticsRouter = Router()

// GET /api/analytics/uktved?code=8525890010&importId=xxx
analyticsRouter.get('/uktved', async (req: Request, res: Response) => {
  try {
    let { code, importId = 'latest' } = req.query as Record<string, string>

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
    }
    if (importId && importId !== 'all') {
      where.import_id = importId
    }

    const grouped = await prisma.$queryRaw<{
      product_name: string
      count: bigint
      total_qty: number | null
      unit_name: string | null
      total_weight: number | null
      total_value_usd: number | null
    }[]>`
      SELECT
        product_name,
        COUNT(*) as count,
        SUM(add_unit_qty) as total_qty,
        MAX(add_unit_name) as unit_name,
        SUM(weight_net) as total_weight,
        SUM(invoice_value_usd) as total_value_usd
      FROM declarations
      WHERE product_code LIKE ${code + '%'}
        ${importId && importId !== 'all'
          ? prisma.$raw`AND import_id = ${importId}`
          : prisma.$raw``
        }
        AND product_name IS NOT NULL
        AND product_name != ''
      GROUP BY product_name
      ORDER BY total_value_usd DESC NULLS LAST
      LIMIT 200
    `

    const totals = await prisma.declaration.aggregate({
      where,
      _count: { id: true },
      _sum: {
        add_unit_qty: true,
        weight_net: true,
        invoice_value_usd: true,
      },
    })

    res.json({
      code,
      rows: grouped.map(r => ({
        product_name: r.product_name,
        count: Number(r.count),
        total_qty: r.total_qty ? Number(r.total_qty) : null,
        unit_name: r.unit_name,
        total_weight: r.total_weight ? Number(r.total_weight) : null,
        total_value_usd: r.total_value_usd ? Number(r.total_value_usd) : null,
      })),
      totals: {
        declarations: totals._count.id,
        total_qty: totals._sum.add_unit_qty ? Number(totals._sum.add_unit_qty) : null,
        total_weight: totals._sum.weight_net ? Number(totals._sum.weight_net) : null,
        total_value_usd: totals._sum.invoice_value_usd ? Number(totals._sum.invoice_value_usd) : null,
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})