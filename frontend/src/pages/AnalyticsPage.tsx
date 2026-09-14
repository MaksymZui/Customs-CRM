import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../api/client'
import { formatUSD, formatKg } from '../api/declarations'

interface BrandModelRow {
  brand: string
  model: string
  count: number
  total_qty: number | null
  unit_name: string | null
  total_weight: number | null
  total_value_usd: number | null
}

interface ProductNameRow {
  product_name: string
  count: number
  total_qty: number | null
  unit_name: string | null
  total_weight: number | null
  total_value_usd: number | null
}

interface AnalyticsResponse {
  code: string
  by_brand_model: BrandModelRow[]
  by_product_name: ProductNameRow[]
  totals: {
    declarations: number
    total_qty: number | null
    total_weight: number | null
    total_value_usd: number | null
  }
}

type Tab = 'brand' | 'product'

export default function AnalyticsPage() {
  const [code, setCode] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('brand')
  const [importId, setImportId] = useState(
    localStorage.getItem('selectedImportId') || 'latest'
  )

  useEffect(() => {
    const handler = () => {
      setImportId(localStorage.getItem('selectedImportId') || 'latest')
    }
    window.addEventListener('importFilterChanged', handler)
    return () => window.removeEventListener('importFilterChanged', handler)
  }, [])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['analytics-uktved', code, importId],
    queryFn: () =>
      api.get<AnalyticsResponse>('/analytics/uktved', {
        params: { code, importId },
      }).then(r => r.data),
    enabled: code.length >= 4,
    placeholderData: prev => prev,
  })

  const filteredBrand = data?.by_brand_model.filter(r =>
    !search ||
    r.brand.toLowerCase().includes(search.toLowerCase()) ||
    r.model.toLowerCase().includes(search.toLowerCase())
  ) ?? []

  const filteredProduct = data?.by_product_name.filter(r =>
    !search || r.product_name.toLowerCase().includes(search.toLowerCase())
  ) ?? []

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-100">Аналіз по УКТ ЗЕД</h1>

      {/* Inputs */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-gray-400 text-xs mb-1 block">Код УКТ ЗЕД (мінімум 4 цифри)</label>
          <input
            type="text"
            placeholder="наприклад: 8525890010"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <div className="flex-1">
          <label className="text-gray-400 text-xs mb-1 block">Пошук</label>
          <input
            type="text"
            placeholder="бренд, модель, назва товару..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Totals */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Декларацій', value: data.totals.declarations.toLocaleString('uk-UA') },
            { label: 'Загальна кількість', value: data.totals.total_qty ? `${data.totals.total_qty.toLocaleString('uk-UA')} шт` : '—' },
            { label: 'Загальна вага', value: formatKg(data.totals.total_weight) },
            { label: 'Загальна вартість', value: formatUSD(data.totals.total_value_usd) },
          ].map(s => (
            <div key={s.label} className="bg-gray-900 rounded-lg px-4 py-3">
              <p className="text-gray-500 text-xs mb-1">{s.label}</p>
              <p className="text-gray-100 font-semibold">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Hint */}
      {code.length < 4 && (
        <p className="text-gray-500 text-sm text-center py-8">
          Введіть код УКТ ЗЕД (мінімум 4 цифри) щоб побачити аналіз
        </p>
      )}

      {isLoading && <p className="text-gray-400 text-center py-8">Завантаження...</p>}

      {data && (
        <div className="bg-gray-900 rounded-xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => setTab('brand')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                tab === 'brand'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Бренд / Модель
            </button>
            <button
              onClick={() => setTab('product')}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                tab === 'product'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Назва товару
            </button>
            {isFetching && (
              <span className="ml-auto px-4 py-3 text-blue-400 text-xs self-center">
                Оновлення...
              </span>
            )}
          </div>

          {/* Brand/Model tab */}
          {tab === 'brand' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800 text-gray-400 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">Бренд</th>
                    <th className="text-left px-4 py-3">Модель</th>
                    <th className="text-right px-4 py-3">Декларацій</th>
                    <th className="text-right px-4 py-3">Кількість</th>
                    <th className="text-right px-4 py-3">Вага нетто</th>
                    <th className="text-right px-4 py-3">Вартість $</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBrand.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-gray-500 py-8">
                        {data.by_brand_model.length === 0
                          ? 'Бренди не розпізнані — дані з\'являться після наступного імпорту'
                          : 'Нічого не знайдено'}
                      </td>
                    </tr>
                  ) : (
                    filteredBrand.map((row, i) => (
                      <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-blue-300 font-medium">{row.brand}</td>
                        <td className="px-4 py-3 text-gray-300">{row.model}</td>
                        <td className="px-4 py-3 text-right text-gray-300">{row.count.toLocaleString('uk-UA')}</td>
                        <td className="px-4 py-3 text-right text-gray-300">
                          {row.total_qty ? `${row.total_qty.toLocaleString('uk-UA')} ${row.unit_name || 'шт'}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300">{formatKg(row.total_weight)}</td>
                        <td className="px-4 py-3 text-right text-blue-400 font-medium">{formatUSD(row.total_value_usd)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Product name tab */}
          {tab === 'product' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800 text-gray-400 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">Назва товару</th>
                    <th className="text-right px-4 py-3">Декларацій</th>
                    <th className="text-right px-4 py-3">Кількість</th>
                    <th className="text-right px-4 py-3">Вага нетто</th>
                    <th className="text-right px-4 py-3">Вартість $</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProduct.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center text-gray-500 py-8">Нічого не знайдено</td>
                    </tr>
                  ) : (
                    filteredProduct.map((row, i) => (
                      <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-gray-300 max-w-[600px]">
                          <p className="line-clamp-3 text-xs leading-relaxed">{row.product_name}</p>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300">{row.count.toLocaleString('uk-UA')}</td>
                        <td className="px-4 py-3 text-right text-gray-300">
                          {row.total_qty ? `${row.total_qty.toLocaleString('uk-UA')} ${row.unit_name || 'шт'}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300">{formatKg(row.total_weight)}</td>
                        <td className="px-4 py-3 text-right text-blue-400 font-medium">{formatUSD(row.total_value_usd)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}