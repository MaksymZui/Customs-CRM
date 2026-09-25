import { Router, Request, Response } from 'express'
import prisma from '../lib/prisma'

export const analyticsRouter = Router()

analyticsRouter.get('/uktved', async (req: Request, res: Response) => {
  try {
    let { code, importId = 'latest' } = req.query as Record<string, string>

    if (!code) return res.status(400).json({ error: 'code is required' })

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

// Деталізація по УКТ ЗЕД — отримувачі та відправники
analyticsRouter.get('/uktved-detail', async (req: Request, res: Response) => {
  try {
    let { code, importId = 'latest', months } = req.query as Record<string, string>

    if (!code) return res.status(400).json({ error: 'code is required' })
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

    const monthList = months
      ? months.split(',').map(s => s.trim()).filter(Boolean)
      : []
    const monthFilter = monthList.length > 0
      ? `AND TO_CHAR(MAKE_DATE(1899, 12, 30) + (declaration_date * INTERVAL '1 day'), 'YYYY-MM') IN (${monthList.map(m => `'${m}'`).join(',')})`
      : ''

    const codeFilter = `product_code LIKE '${cleanCode}%'`

    // Загальний обсяг
    const totalResult = await prisma.$queryRawUnsafe<{ total_usd: number }[]>(`
      SELECT SUM(invoice_value_usd) as total_usd
      FROM declarations
      WHERE ${codeFilter}
        ${importFilter}
        ${monthFilter}
    `)
    const totalUsd = Number(totalResult[0]?.total_usd || 0)

       // Отримувачі
    const recipients = await prisma.$queryRawUnsafe<{
      recipient_code: number
      recipient_name: string
      total_usd: number
      decl_count: bigint
    }[]>(`
      SELECT
        recipient_code,
        MIN(recipient_name) as recipient_name,
        SUM(invoice_value_usd) as total_usd,
        COUNT(DISTINCT decl_num_number) as decl_count
      FROM declarations
      WHERE ${codeFilter}
        ${importFilter}
        ${monthFilter}
        AND recipient_name IS NOT NULL
        AND recipient_code IS NOT NULL
      GROUP BY recipient_code
      ORDER BY total_usd DESC NULLS LAST
      LIMIT 100
    `)

       // Відправники
    const senders = await prisma.$queryRawUnsafe<{
      sender_name: string
      origin_country: string
      total_usd: number
      decl_count: bigint
    }[]>(`
      SELECT
        MIN(sender_name) as sender_name,
        MIN(origin_country) as origin_country,
        SUM(invoice_value_usd) as total_usd,
        COUNT(DISTINCT decl_num_number) as decl_count
      FROM declarations
      WHERE ${codeFilter}
        ${importFilter}
        ${monthFilter}
        AND sender_name IS NOT NULL
      GROUP BY
        REGEXP_REPLACE(
          UPPER(TRIM(sender_name)),
          '[^A-ZА-ЯІЇЄҐ0-9]',
          '',
          'g'
        )
      ORDER BY total_usd DESC NULLS LAST
      LIMIT 100
    `)

    res.json({
      code: cleanCode,
      total_usd: totalUsd,
      recipients: recipients.map(r => ({
        recipient_code: r.recipient_code,
        recipient_name: r.recipient_name,
        total_usd: Number(r.total_usd || 0),
        share_pct: totalUsd > 0 ? (Number(r.total_usd || 0) / totalUsd) * 100 : 0,
        decl_count: Number(r.decl_count),
      })),
      senders: senders.map(r => ({
        sender_name: r.sender_name,
        origin_country: r.origin_country,
        total_usd: Number(r.total_usd || 0),
        share_pct: totalUsd > 0 ? (Number(r.total_usd || 0) / totalUsd) * 100 : 0,
        decl_count: Number(r.decl_count),
      })),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Список доступних місяців
analyticsRouter.get('/available-months', async (req: Request, res: Response) => {
  try {
    const months = await prisma.$queryRawUnsafe<{ month: string }[]>(`
      SELECT DISTINCT TO_CHAR(MAKE_DATE(1899, 12, 30) + (declaration_date * INTERVAL '1 day'), 'YYYY-MM') as month
      FROM declarations
      WHERE declaration_date IS NOT NULL
      ORDER BY month DESC
    `)
    res.json(months.map(r => r.month).filter(Boolean))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Звіт росту імпорту
analyticsRouter.get('/growth-report', async (req: Request, res: Response) => {
  try {
    let { baseMonths, compareMonths, importId = 'latest' } = req.query as {
      baseMonths?: string
      compareMonths?: string
      importId?: string
    }

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

    const baseList = baseMonths ? baseMonths.split(',').map(s => s.trim()).filter(Boolean) : []
    const compareList = compareMonths ? compareMonths.split(',').map(s => s.trim()).filter(Boolean) : []

    const baseCondition = baseList.length > 0
      ? `TO_CHAR(MAKE_DATE(1899, 12, 30) + (declaration_date * INTERVAL '1 day'), 'YYYY-MM') IN (${baseList.map(m => `'${m}'`).join(',')})`
      : '1=0'

    const compareCondition = compareList.length > 0
      ? `TO_CHAR(MAKE_DATE(1899, 12, 30) + (declaration_date * INTERVAL '1 day'), 'YYYY-MM') IN (${compareList.map(m => `'${m}'`).join(',')})`
      : '1=0'

    const reportData = await prisma.$queryRawUnsafe<{
      ukt_zed_4: string
      base_value_usd: number | null
      compare_value_usd: number | null
      base_decl_count: bigint
      compare_decl_count: bigint
    }[]>(`
      SELECT 
        LEFT(product_code, 4) AS ukt_zed_4,
        SUM(CASE WHEN ${baseCondition} THEN invoice_value_usd ELSE 0 END) AS base_value_usd,
        SUM(CASE WHEN ${compareCondition} THEN invoice_value_usd ELSE 0 END) AS compare_value_usd,
        COUNT(DISTINCT CASE WHEN ${baseCondition} THEN decl_num_number END) AS base_decl_count,
        COUNT(DISTINCT CASE WHEN ${compareCondition} THEN decl_num_number END) AS compare_decl_count
      FROM declarations
      WHERE product_code IS NOT NULL 
        AND product_code != ''
        ${importFilter}
      GROUP BY LEFT(product_code, 4)
      HAVING SUM(CASE WHEN ${compareCondition} THEN invoice_value_usd ELSE 0 END) > 0
         OR SUM(CASE WHEN ${baseCondition} THEN invoice_value_usd ELSE 0 END) > 0
      ORDER BY compare_value_usd DESC
      LIMIT 100
    `)

    const result = reportData.map(row => {
      const baseVal = Number(row.base_value_usd || 0)
      const compVal = Number(row.compare_value_usd || 0)
      const growthUsd = compVal - baseVal
      const growthValuePct = baseVal > 0 ? ((compVal / baseVal) - 1) * 100 : (compVal > 0 ? 100 : 0)
      const baseDecl = Number(row.base_decl_count || 0)
      const compDecl = Number(row.compare_decl_count || 0)
      const growthDeclPct = baseDecl > 0 ? ((compDecl / baseDecl) - 1) * 100 : (compDecl > 0 ? 100 : 0)

      return {
        ukt_zed_4: row.ukt_zed_4,
        base_value_usd: baseVal,
        compare_value_usd: compVal,
        growth_usd: growthUsd,
        growth_value_pct: growthValuePct,
        base_decl_count: baseDecl,
        compare_decl_count: compDecl,
        growth_decl_pct: growthDeclPct,
      }
    })

    result.sort((a, b) => b.growth_usd - a.growth_usd)
    res.json(result.slice(0, 50))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

analyticsRouter.get('/counterparty', async (req: Request, res: Response) => {
  try {
    let { type, query, importId = 'latest', months } = req.query as Record<string, string>

    if (!type || !query) return res.status(400).json({ error: 'type and query are required' })

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

    const monthList = months ? months.split(',').map(s => s.trim()).filter(Boolean) : []
    const monthFilter = monthList.length > 0
      ? `AND TO_CHAR(MAKE_DATE(1899, 12, 30) + (declaration_date * INTERVAL '1 day'), 'YYYY-MM') IN (${monthList.map(m => `'${m}'`).join(',')})`
      : ''

    // Фільтр по типу контрагента
    const safeQuery = query.replace(/'/g, "''")
    const counterpartyFilter = type === 'recipient'
      ? `AND (recipient_name ILIKE '%${safeQuery}%' OR CAST(recipient_code AS TEXT) = '${safeQuery}')`
      : `AND sender_name ILIKE '%${safeQuery}%'`

    // Загальна зведення
    const summaryResult = await prisma.$queryRawUnsafe<{
      total_usd: number
      decl_count: bigint
      ukt_count: bigint
    }[]>(`
      SELECT
        SUM(invoice_value_usd) as total_usd,
        COUNT(DISTINCT decl_num_number) as decl_count,
        COUNT(DISTINCT LEFT(product_code, 4)) as ukt_count
      FROM declarations
      WHERE 1=1
        ${counterpartyFilter}
        ${importFilter}
        ${monthFilter}
    `)

    const summary = summaryResult[0]

    // Розбивка по УКТ ЗЕД
    const byUkt = await prisma.$queryRawUnsafe<{
      ukt_zed_4: string
      total_usd: number
      decl_count: bigint
    }[]>(`
      SELECT
        LEFT(product_code, 4) as ukt_zed_4,
        SUM(invoice_value_usd) as total_usd,
        COUNT(DISTINCT decl_num_number) as decl_count
      FROM declarations
      WHERE product_code IS NOT NULL
        AND product_code != ''
        ${counterpartyFilter}
        ${importFilter}
        ${monthFilter}
      GROUP BY LEFT(product_code, 4)
      ORDER BY total_usd DESC NULLS LAST
      LIMIT 50
    `)

    const totalUsd = Number(summary?.total_usd || 0)

    res.json({
      type,
      query,
      summary: {
        total_usd: totalUsd,
        decl_count: Number(summary?.decl_count || 0),
        ukt_count: Number(summary?.ukt_count || 0),
      },
      by_ukt: byUkt.map(r => ({
        ukt_zed_4: r.ukt_zed_4,
        total_usd: Number(r.total_usd || 0),
        share_pct: totalUsd > 0 ? (Number(r.total_usd || 0) / totalUsd) * 100 : 0,
        decl_count: Number(r.decl_count),
      })),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})