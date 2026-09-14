import { Router, Request, Response } from 'express'
import prisma from '../lib/prisma'

export const analyticsRouter = Router()

analyticsRouter.get('/uktved', async (req: Request, res: Response) => {
  try {
    let { code, importId = 'latest' } = req.query as Record<string, string>

    if (!code) return res.status(400).json({ error: 'code is required' })

    // Очищаємо код від усіх нецифрових символів
    const cleanCode = code.replace(/\D/g, '')
    if (!cleanCode) return res.status(400).json({ error: 'invalid code' })

    if (!importId || importId === 'latest') {
      const latestJob = await prisma.importJob.findFirst({
        where: { status: 'done' },
        orderBy: { created_at: 'desc' },
      })
      importId = latestJob ? latestJob.id : ''
    }

    const importFilter = importId && importId !== 'all'
      ? `AND import_id = '${importId}'`
      : ''

    const byBrandModel = await prisma.$queryRawUnsafe<{
      brand: string | null
      model: string | null
      count: bigint
      total_qty: number | null
      unit_name: string | null
      total_weight: number | null
      total_value_usd: number | null
    }[]>(`
      SELECT
        brand,
        model,
        COUNT(*) as count,
        SUM(COALESCE(qty_parsed, add_unit_qty)) as total_qty,
        MAX(add_unit_name) as unit_name,
        SUM(weight_net) as total_weight,
        SUM(invoice_value_usd) as total_value_usd
      FROM declarations
      WHERE product_code LIKE '${cleanCode}%'
        ${importFilter}
        AND product_name IS NOT NULL
        AND product_name != ''
      GROUP BY brand, model
      ORDER BY total_value_usd DESC NULLS LAST
      LIMIT 200
    `)

    const byProductName = await prisma.$queryRawUnsafe<{
      product_name: string
      count: bigint
      total_qty: number | null
      unit_name: string | null
      total_weight: number | null
      total_value_usd: number | null
    }[]>(`
      SELECT
        product_name,
        COUNT(*) as count,
        SUM(COALESCE(qty_parsed, add_unit_qty)) as total_qty,
        MAX(add_unit_name) as unit_name,
        SUM(weight_net) as total_weight,
        SUM(invoice_value_usd) as total_value_usd
      FROM declarations
      WHERE product_code LIKE '${cleanCode}%'
        ${importFilter}
        AND product_name IS NOT NULL
        AND product_name != ''
      GROUP BY product_name
      ORDER BY total_value_usd DESC NULLS LAST
      LIMIT 200
    `)

    const where: Record<string, unknown> = {
      product_code: { startsWith: cleanCode },
    }
    if (importId && importId !== 'all') {
      where.import_id = importId
    }

    const totals = await prisma.declaration.aggregate({
      where,
      _count: { id: true },
      _sum: {
        qty_parsed: true,
        add_unit_qty: true,
        weight_net: true,
        invoice_value_usd: true,
      },
    })

    res.json({
      code: cleanCode,
      by_brand_model: byBrandModel.map(r => ({
        brand: r.brand || '—',
        model: r.model || '—',
        count: Number(r.count),
        total_qty: r.total_qty ? Number(r.total_qty) : null,
        unit_name: r.unit_name,
        total_weight: r.total_weight ? Number(r.total_weight) : null,
        total_value_usd: r.total_value_usd ? Number(r.total_value_usd) : null,
      })),
      by_product_name: byProductName.map(r => ({
        product_name: r.product_name,
        count: Number(r.count),
        total_qty: r.total_qty ? Number(r.total_qty) : null,
        unit_name: r.unit_name,
        total_weight: r.total_weight ? Number(r.total_weight) : null,
        total_value_usd: r.total_value_usd ? Number(r.total_value_usd) : null,
      })),
      totals: {
        declarations: totals._count.id,
        total_qty: totals._sum.qty_parsed
          ? Number(totals._sum.qty_parsed)
          : totals._sum.add_unit_qty
          ? Number(totals._sum.add_unit_qty)
          : null,
        total_weight: totals._sum.weight_net ? Number(totals._sum.weight_net) : null,
        total_value_usd: totals._sum.invoice_value_usd ? Number(totals._sum.invoice_value_usd) : null,
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})