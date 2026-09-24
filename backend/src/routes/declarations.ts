import { Router, Request, Response } from 'express'
import prisma from '../lib/prisma'

export const declarationsRouter = Router()

let filtersCache: any = null
let lastFiltersFetch = 0

const ALLOWED_SORT = new Set([
  'id', 'declaration_date', 'decl_num_prefix', 'customs_office',
  'trade_country', 'origin_country', 'product_code', 'recipient_name',
  'recipient_code', 'weight_net', 'invoice_value_usd', 'customs_value_usd', 'duty_uah', 'vat_uah',
  'brand', 'model', 'qty_parsed'
])

declarationsRouter.get('/filters/options', async (_req: Request, res: Response) => {
  try {
    if (filtersCache && Date.now() - lastFiltersFetch < 10 * 60 * 1000) {
      return res.json(filtersCache)
    }

    const [customs_offices, trade_countries, origin_countries, currencies, conditions] =
      await Promise.all([
        prisma.$queryRaw<{ customs_office: string }[]>`SELECT DISTINCT customs_office FROM declarations WHERE customs_office IS NOT NULL ORDER BY customs_office LIMIT 500`,
        prisma.$queryRaw<{ trade_country: string }[]>`SELECT DISTINCT trade_country FROM declarations WHERE trade_country IS NOT NULL ORDER BY trade_country LIMIT 500`,
        prisma.$queryRaw<{ origin_country: string }[]>`SELECT DISTINCT origin_country FROM declarations WHERE origin_country IS NOT NULL ORDER BY origin_country LIMIT 500`,
        prisma.$queryRaw<{ currency_name: string }[]>`SELECT DISTINCT currency_name FROM declarations WHERE currency_name IS NOT NULL ORDER BY currency_name LIMIT 100`,
        prisma.$queryRaw<{ delivery_condition: string }[]>`SELECT DISTINCT delivery_condition FROM declarations WHERE delivery_condition IS NOT NULL ORDER BY delivery_condition LIMIT 100`,
      ])

    filtersCache = {
      customs_offices: customs_offices.map(r => r.customs_office),
      trade_countries: trade_countries.map(r => r.trade_country),
      origin_countries: origin_countries.map(r => r.origin_country),
      currencies: currencies.map(r => r.currency_name),
      delivery_conditions: conditions.map(r => r.delivery_condition),
    }
    lastFiltersFetch = Date.now()

    res.json(filtersCache)
  } catch (err) {
    console.error('Error fetching filter options:', err)
    res.status(500).json({ error: 'Failed to fetch filters' })
  }
})

declarationsRouter.get('/', async (req: Request, res: Response) => {
  try {
    let {
      page = '1',
      limit = '50',
      sortBy = 'id',
      sortDir = 'asc',
      importId = 'latest',
      customs_office,
      trade_country,
      origin_country,
      product_code,
      recipient_name,
      recipient_code,
      sender_name,
      delivery_condition,
      currency_name,
      decl_num_prefix,
      date_from,
      date_to,
      value_usd_min,
      value_usd_max,
      weight_min,
      weight_max,
      search,
    } = req.query as Record<string, string>

    if (!importId || importId === 'latest') {
      const latestJob = await prisma.importJob.findFirst({
        where: { status: 'done' },
        orderBy: { created_at: 'desc' },
      })
      importId = latestJob ? latestJob.id : ''
    }

    const take = Math.min(parseInt(limit) || 50, 200)
    const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take
    const orderField = ALLOWED_SORT.has(sortBy) ? sortBy : 'id'
    const orderDir = sortDir === 'desc' ? 'desc' : 'asc'

    const where: Record<string, unknown> = {}

    if (importId && importId !== 'all') {
      where.import_id = importId
    }

    if (customs_office) where.customs_office = { in: customs_office.split(',') }
    if (trade_country) where.trade_country = { in: trade_country.split(',') }
    if (origin_country) where.origin_country = { in: origin_country.split(',') }
    if (product_code) where.product_code = { startsWith: product_code }
    if (decl_num_prefix) where.decl_num_prefix = { contains: decl_num_prefix, mode: 'insensitive' }
    if (recipient_name) where.recipient_name = { contains: recipient_name, mode: 'insensitive' }
    if (recipient_code && !isNaN(parseFloat(recipient_code))) {
      where.recipient_code = { equals: parseFloat(recipient_code) }
    }
    if (sender_name) where.sender_name = { contains: sender_name, mode: 'insensitive' }
    if (delivery_condition) where.delivery_condition = { in: delivery_condition.split(',') }
    if (currency_name) where.currency_name = { in: currency_name.split(',') }

    if (date_from || date_to) {
      where.declaration_date = {
        ...(date_from ? { gte: parseExcelDate(date_from) } : {}),
        ...(date_to ? { lte: parseExcelDate(date_to) } : {}),
      }
    }
    if (value_usd_min || value_usd_max) {
      where.invoice_value_usd = {
        ...(value_usd_min ? { gte: parseFloat(value_usd_min) } : {}),
        ...(value_usd_max ? { lte: parseFloat(value_usd_max) } : {}),
      }
    }
    if (weight_min || weight_max) {
      where.weight_net = {
        ...(weight_min ? { gte: parseFloat(weight_min) } : {}),
        ...(weight_max ? { lte: parseFloat(weight_max) } : {}),
      }
    }
    if (search) {
      where.OR = [
        { product_name: { contains: search, mode: 'insensitive' } },
        { recipient_name: { contains: search, mode: 'insensitive' } },
        { sender_name: { contains: search, mode: 'insensitive' } },
        { decl_num_prefix: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [data, total, sums] = await Promise.all([
      prisma.declaration.findMany({
        where,
        orderBy: { [orderField]: orderDir },
        skip,
        take,
        select: {
          id: true,
          decl_num_prefix: true,
          decl_num_year: true,
          decl_num_number: true,
          declaration_date: true,
          customs_office: true,
          trade_country: true,
          origin_country: true,
          product_code: true,
          product_name: true,
          recipient_code: true,
          recipient_name: true,
          sender_name: true,
          delivery_condition: true,
          currency_name: true,
          container_number: true,
          weight_gross: true,
          weight_net: true,
          invoice_value_usd: true,
          invoice_value_uah: true,
          customs_value_usd: true,
          customs_value_uah: true,
          duty_uah: true,
          excise_uah: true,
          vat_uah: true,
          exchange_rate: true,
          import_id: true,
          brand: true,
          model: true,
          qty_parsed: true,
          add_unit_qty: true,
          add_unit_name: true,
        },
      }),
      prisma.declaration.count({ where }),
      prisma.declaration.aggregate({
        where,
        _sum: {
          invoice_value_usd: true,
          customs_value_usd: true,
          duty_uah: true,
          vat_uah: true,
          weight_net: true,
        },
      }),
    ])

    res.json({
      data,
      pagination: {
        page: parseInt(page) || 1,
        limit: take,
        total,
        pages: Math.ceil(total / take) || 1,
      },
      sums: {
        invoice_usd: Number(sums._sum.invoice_value_usd || 0),
        customs_usd: Number(sums._sum.customs_value_usd || 0),
        duty_uah: Number(sums._sum.duty_uah || 0),
        vat_uah: Number(sums._sum.vat_uah || 0),
        weight_net: Number(sums._sum.weight_net || 0),
      },
    })
  } catch (err) {
    console.error('Error fetching declarations:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

declarationsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' })
    const row = await prisma.declaration.findUnique({ where: { id } })
    if (!row) return res.status(404).json({ error: 'Not found' })
    res.json(row)
  } catch (err) {
    console.error('Error fetching declaration item:', err)
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