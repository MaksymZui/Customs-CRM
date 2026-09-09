import { Router, Request, Response } from 'express'
import prisma from '../lib/prisma'

export const declarationsRouter = Router()

const ALLOWED_SORT = new Set([
  'id', 'declaration_date', 'decl_num_prefix', 'customs_office',
  'trade_country', 'origin_country', 'product_code', 'recipient_name',
  'weight_net', 'invoice_value_usd', 'customs_value_usd', 'duty_uah', 'vat_uah'
])

declarationsRouter.get('/filters/options', async (_req: Request, res: Response) => {
  const [customs_offices, trade_countries, origin_countries, currencies, conditions] =
    await Promise.all([
      prisma.declaration.findMany({ select: { customs_office: true }, distinct: ['customs_office'], where: { customs_office: { not: null } }, take: 500 }),
      prisma.declaration.findMany({ select: { trade_country: true }, distinct: ['trade_country'], where: { trade_country: { not: null } }, take: 500 }),
      prisma.declaration.findMany({ select: { origin_country: true }, distinct: ['origin_country'], where: { origin_country: { not: null } }, take: 500 }),
      prisma.declaration.findMany({ select: { currency_name: true }, distinct: ['currency_name'], where: { currency_name: { not: null } }, take: 100 }),
      prisma.declaration.findMany({ select: { delivery_condition: true }, distinct: ['delivery_condition'], where: { delivery_condition: { not: null } }, take: 100 }),
    ])

  res.json({
    customs_offices: customs_offices.map(r => r.customs_office).filter(Boolean).sort(),
    trade_countries: trade_countries.map(r => r.trade_country).filter(Boolean).sort(),
    origin_countries: origin_countries.map(r => r.origin_country).filter(Boolean).sort(),
    currencies: currencies.map(r => r.currency_name).filter(Boolean).sort(),
    delivery_conditions: conditions.map(r => r.delivery_condition).filter(Boolean).sort(),
  })
})

declarationsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const {
      page = '1',
      limit = '50',
      sortBy = 'id',
      sortDir = 'asc',
      customs_office,
      trade_country,
      origin_country,
      product_code,
      recipient_name,
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

    const take = Math.min(parseInt(limit), 200)
    const skip = (parseInt(page) - 1) * take
    const orderField = ALLOWED_SORT.has(sortBy) ? sortBy : 'id'
    const orderDir = sortDir === 'desc' ? 'desc' : 'asc'

    const where: Record<string, unknown> = {}

    if (customs_office) where.customs_office = { in: customs_office.split(',') }
    if (trade_country) where.trade_country = { in: trade_country.split(',') }
    if (origin_country) where.origin_country = { in: origin_country.split(',') }
    if (product_code) where.product_code = { startsWith: product_code }
    if (decl_num_prefix) where.decl_num_prefix = { contains: decl_num_prefix, mode: 'insensitive' }
    if (recipient_name) where.recipient_name = { contains: recipient_name, mode: 'insensitive' }
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

    const [data, total] = await Promise.all([
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
        },
      }),
      prisma.declaration.count({ where }),
    ])

    res.json({
      data,
      pagination: {
        page: parseInt(page),
        limit: take,
        total,
        pages: Math.ceil(total / take),
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

declarationsRouter.get('/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const row = await prisma.declaration.findUnique({ where: { id } })
  if (!row) return res.status(404).json({ error: 'Not found' })
  res.json(row)
})

function parseExcelDate(val: string): number {
  if (val.includes('-')) {
    const d = new Date(val)
    const excelEpoch = new Date(1899, 11, 30)
    return Math.floor((d.getTime() - excelEpoch.getTime()) / 86400000)
  }
  return parseFloat(val)
}