import api from './client'

export interface Declaration {
  id: number
  decl_num_prefix: string | null
  decl_num_year: number | null
  decl_num_number: number | null
  declaration_date: number | null
  customs_office: string | null
  trade_country: string | null
  origin_country: string | null
  product_code: string | null
  product_name: string | null
  recipient_name: string | null
  sender_name: string | null
  delivery_condition: string | null
  currency_name: string | null
  container_number: string | null
  weight_gross: number | null
  weight_net: number | null
  invoice_value_usd: number | null
  invoice_value_uah: number | null
  customs_value_usd: number | null
  customs_value_uah: number | null
  duty_uah: number | null
  excise_uah: number | null
  vat_uah: number | null
  exchange_rate: number | null
}

export interface DeclarationsResponse {
  data: Declaration[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

export interface FilterOptions {
  customs_offices: string[]
  trade_countries: string[]
  origin_countries: string[]
  currencies: string[]
  delivery_conditions: string[]
}

export interface DeclarationFilters {
  page?: number
  limit?: number
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  importId?: string
  customs_office?: string
  trade_country?: string
  origin_country?: string
  product_code?: string
  recipient_name?: string
  sender_name?: string
  delivery_condition?: string
  currency_name?: string
  decl_num_prefix?: string
  date_from?: string
  date_to?: string
  value_usd_min?: string
  value_usd_max?: string
  weight_min?: string
  weight_max?: string
  search?: string
}

export const declarationsApi = {
  getAll: (filters: DeclarationFilters) =>
    api.get<DeclarationsResponse>('/declarations', { params: filters }).then(r => r.data),

  getById: (id: number) =>
    api.get<Declaration>(`/declarations/${id}`).then(r => r.data),

  getFilterOptions: () =>
    api.get<FilterOptions>('/declarations/filters/options').then(r => r.data),
}

export function excelDateToString(serial: number | null): string {
  if (!serial) return '—'
  const date = new Date(Math.round((serial - 25569) * 86400 * 1000))
  return date.toLocaleDateString('uk-UA')
}

export function formatUSD(val: number | null): string {
  if (val === null || val === undefined) return '—'
  return new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val) + ' $'
}

export function formatUAH(val: number | null): string {
  if (val === null || val === undefined) return '—'
  return new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val) + ' ₴'
}

export function formatKg(val: number | null): string {
  if (val === null || val === undefined) return '—'
  return new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val) + ' кг'
}