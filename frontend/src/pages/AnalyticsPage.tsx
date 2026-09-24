import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../api/client'
import { formatUSD, formatKg } from '../api/declarations'
import MonthSelect from '../components/MonthSelect'

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

interface GrowthReportRow {
  ukt_zed_4: string
  base_value_usd: number
  compare_value_usd: number
  growth_usd: number
  growth_value_pct: number
  base_decl_count: number
  compare_decl_count: number
  growth_decl_pct: number
}

interface DetailResponse {
  code: string
  total_usd: number
  recipients: {
    recipient_code: number
    recipient_name: string
    total_usd: number
    share_pct: number
    decl_count: number
  }[]
  senders: {
    sender_name: string
    origin_country: string
    total_usd: number
    share_pct: number
    decl_count: number
  }[]
}

type Tab = 'brand' | 'product'
type MainTab = 'search' | 'growth-report' | 'detail'

export default function AnalyticsPage() {
  const [mainTab, setMainTab] = useState<MainTab>('search')

  const [code, setCode] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('brand')

  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [baseMonths, setBaseMonths] = useState<string[]>([])
  const [compareMonths, setCompareMonths] = useState<string[]>([])

  // Для деталізації
  const [detailCode, setDetailCode] = useState('')
  const [detailCodeInput, setDetailCodeInput] = useState('')
  const [detailMonths, setDetailMonths] = useState<string[]>([])
  const [detailMonthsAvailable, setDetailMonthsAvailable] = useState<string[]>([])

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

  useEffect(() => {
    if (mainTab === 'growth-report' || mainTab === 'detail') {
      api.get<string[]>('/analytics/available-months').then(res => {
        setAvailableMonths(res.data)
        setDetailMonthsAvailable(res.data)
        if (res.data.length >= 6 && baseMonths.length === 0) {
          setCompareMonths(res.data.slice(0, 3))
          setBaseMonths(res.data.slice(3, 6))
        }
      })
    }
  }, [mainTab])

  const { data: growthData, isLoading: growthLoading } = useQuery({
    queryKey: ['growth-report', baseMonths, compareMonths, importId],
    queryFn: () =>
      api.get<GrowthReportRow[]>('/analytics/growth-report', {
        params: {
          baseMonths: baseMonths.join(','),
          compareMonths: compareMonths.join(','),
          importId,
        },
      }).then(r => r.data),
    enabled: mainTab === 'growth-report' && baseMonths.length > 0 && compareMonths.length > 0,
  })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['analytics-uktved', code, importId],
    queryFn: () =>
      api.get<AnalyticsResponse>('/analytics/uktved', {
        params: { code, importId },
      }).then(r => r.data),
    enabled: mainTab === 'search' && code.length >= 4,
    placeholderData: prev => prev,
  })

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['analytics-detail', detailCode, detailMonths, importId],
    queryFn: () =>
      api.get<DetailResponse>('/analytics/uktved-detail', {
        params: {
          code: detailCode,
          importId,
          months: detailMonths.join(','),
        },
      }).then(r => r.data),
    enabled: mainTab === 'detail' && detailCode.length >= 4,
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

      <div className="flex border-b border-gray-800 gap-4">
        <button
          onClick={() => setMainTab('search')}
          className={`pb-2 text-sm font-medium transition-colors ${
            mainTab === 'search'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          🔍 Пошук за кодом
        </button>
        <button
          onClick={() => setMainTab('growth-report')}
          className={`pb-2 text-sm font-medium transition-colors ${
            mainTab === 'growth-report'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          📈 Звіт росту імпорту (ТОП-50)
        </button>
        <button
          onClick={() => setMainTab('detail')}
          className={`pb-2 text-sm font-medium transition-colors ${
            mainTab === 'detail'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          🏢 Деталізація по УКТ ЗЕД
        </button>
      </div>

      {/* Звіт росту */}
      {mainTab === 'growth-report' && (
        <div className="space-y-6">
          <div className="bg-gray-900 p-4 rounded-xl border border-gray-800 space-y-4">
            <h2 className="text-md font-semibold text-gray-200">Виберіть місяці для порівняння</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-xs text-gray-400 block mb-2 font-medium">
                  Базовий період: {baseMonths.join(', ') || 'не вибрано'}
                </label>
                <MonthSelect months={availableMonths} selected={baseMonths} onChange={setBaseMonths} />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-2 font-medium">
                  Порівнюваний період: {compareMonths.join(', ') || 'не вибрано'}
                </label>
                <MonthSelect months={availableMonths} selected={compareMonths} onChange={setCompareMonths} />
              </div>
            </div>
          </div>

          {growthLoading && <p className="text-gray-400 text-center py-8">Формування звіту...</p>}

          {growthData && (
            <div className="bg-gray-900 rounded-xl overflow-x-auto border border-gray-800">
              <table className="w-full text-xs text-left text-gray-300">
                <thead className="bg-gray-800 text-gray-200 uppercase">
                  <tr>
                    <th className="px-4 py-3">УКТ ЗЕД (4 знаки)</th>
                    <th className="px-4 py-3 text-right">Баз. період $</th>
                    <th className="px-4 py-3 text-right">Пор. період $</th>
                    <th className="px-4 py-3 text-right">Ріст $</th>
                    <th className="px-4 py-3 text-right">Ріст %</th>
                    <th className="px-4 py-3 text-right">Декл. баз.</th>
                    <th className="px-4 py-3 text-right">Декл. пор.</th>
                    <th className="px-4 py-3 text-right">Ріст декл. %</th>
                  </tr>
                </thead>
                <tbody>
                  {growthData.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center text-gray-500 py-8">
                        Немає даних для вибраних періодів
                      </td>
                    </tr>
                  ) : (
                    growthData.map(row => (
                      <tr key={row.ukt_zed_4} className="border-t border-gray-800 hover:bg-gray-800/50">
                        <td className="px-4 py-3 font-semibold text-white">{row.ukt_zed_4}</td>
                        <td className="px-4 py-3 text-right">{formatUSD(row.base_value_usd)}</td>
                        <td className="px-4 py-3 text-right">{formatUSD(row.compare_value_usd)}</td>
                        <td className={`px-4 py-3 text-right font-bold ${row.growth_usd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatUSD(row.growth_usd)}
                        </td>
                        <td className={`px-4 py-3 text-right font-bold ${row.growth_value_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {row.growth_value_pct > 0 ? `+${row.growth_value_pct.toFixed(1)}%` : `${row.growth_value_pct.toFixed(1)}%`}
                        </td>
                        <td className="px-4 py-3 text-right">{row.base_decl_count}</td>
                        <td className="px-4 py-3 text-right">{row.compare_decl_count}</td>
                        <td className={`px-4 py-3 text-right font-bold ${row.growth_decl_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {row.growth_decl_pct > 0 ? `+${row.growth_decl_pct.toFixed(1)}%` : `${row.growth_decl_pct.toFixed(1)}%`}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Деталізація */}
      {mainTab === 'detail' && (
        <div className="space-y-6">
          <div className="bg-gray-900 p-4 rounded-xl border border-gray-800 space-y-4">
            <h2 className="text-md font-semibold text-gray-200">Деталізація по УКТ ЗЕД</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Код УКТ ЗЕД (мінімум 4 цифри)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="наприклад: 8525"
                    className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
                    value={detailCodeInput}
                    onChange={e => setDetailCodeInput(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={e => e.key === 'Enter' && detailCodeInput.length >= 4 && setDetailCode(detailCodeInput)}
                  />
                  <button
                    onClick={() => detailCodeInput.length >= 4 && setDetailCode(detailCodeInput)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Знайти
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">
                  Фільтр за місяцями: {detailMonths.length > 0 ? detailMonths.join(', ') : 'всі місяці'}
                </label>
                <MonthSelect
                  months={detailMonthsAvailable}
                  selected={detailMonths}
                  onChange={setDetailMonths}
                />
              </div>
            </div>
          </div>

          {detailLoading && <p className="text-gray-400 text-center py-8">Завантаження...</p>}

          {detailData && (
            <div className="space-y-4">
              {/* Загальний обсяг */}
              <div className="bg-blue-950/40 border border-blue-800/50 rounded-xl px-5 py-3 flex items-center gap-4">
                <span className="text-gray-400 text-sm">Загальний обсяг імпорту по коду</span>
                <span className="text-white font-bold text-lg">{detailData.code}</span>
                <span className="ml-auto text-blue-300 font-bold text-xl">{formatUSD(detailData.total_usd)}</span>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {/* Отримувачі */}
                <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-800/60 border-b border-gray-700">
                    <h3 className="text-sm font-semibold text-green-400">🏭 Отримувачі (українські компанії)</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Які компанії імпортували товар за цим кодом</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-gray-300">
                      <thead className="bg-gray-800 text-gray-400 uppercase">
                        <tr>
                          <th className="px-3 py-2 text-left">ЄДРПОУ</th>
                          <th className="px-3 py-2 text-left">Отримувач</th>
                          <th className="px-3 py-2 text-right">Обсяг, $</th>
                          <th className="px-3 py-2 text-right">Частка, %</th>
                          <th className="px-3 py-2 text-right">Декларацій</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailData.recipients.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center text-gray-500 py-6">Немає даних</td>
                          </tr>
                        ) : (
                          <>
                            {detailData.recipients.map((r, i) => (
                              <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/50">
                                <td className="px-3 py-2 text-gray-500 font-mono">{r.recipient_code || '—'}</td>
                                <td className="px-3 py-2 text-gray-200 max-w-[200px]">
                                  <p className="truncate" title={r.recipient_name}>{r.recipient_name}</p>
                                </td>
                                <td className="px-3 py-2 text-right text-blue-300 font-medium">{formatUSD(r.total_usd)}</td>
                                <td className="px-3 py-2 text-right text-yellow-400">{r.share_pct.toFixed(1)}%</td>
                                <td className="px-3 py-2 text-right">{r.decl_count}</td>
                              </tr>
                            ))}
                            <tr className="border-t-2 border-gray-600 bg-gray-800/40 font-semibold">
                              <td colSpan={2} className="px-3 py-2 text-gray-200">Разом</td>
                              <td className="px-3 py-2 text-right text-blue-300">{formatUSD(detailData.total_usd)}</td>
                              <td className="px-3 py-2 text-right text-yellow-400">100%</td>
                              <td className="px-3 py-2 text-right text-gray-300">
                                {detailData.recipients.reduce((s, r) => s + r.decl_count, 0)}
                              </td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Відправники */}
                <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-800/60 border-b border-gray-700">
                    <h3 className="text-sm font-semibold text-orange-400">✈️ Відправники (іноземні компанії)</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Які іноземні компанії відправили товар в Україну</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-gray-300">
                      <thead className="bg-gray-800 text-gray-400 uppercase">
                        <tr>
                          <th className="px-3 py-2 text-left">Відправник</th>
                          <th className="px-3 py-2 text-left">Країна</th>
                          <th className="px-3 py-2 text-right">Обсяг, $</th>
                          <th className="px-3 py-2 text-right">Частка, %</th>
                          <th className="px-3 py-2 text-right">Декларацій</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailData.senders.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center text-gray-500 py-6">Немає даних</td>
                          </tr>
                        ) : (
                          <>
                            {detailData.senders.map((r, i) => (
                              <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/50">
                                <td className="px-3 py-2 text-gray-200 max-w-[200px]">
                                  <p className="truncate" title={r.sender_name}>{r.sender_name}</p>
                                </td>
                                <td className="px-3 py-2 text-gray-400">{r.origin_country || '—'}</td>
                                <td className="px-3 py-2 text-right text-blue-300 font-medium">{formatUSD(r.total_usd)}</td>
                                <td className="px-3 py-2 text-right text-yellow-400">{r.share_pct.toFixed(1)}%</td>
                                <td className="px-3 py-2 text-right">{r.decl_count}</td>
                              </tr>
                            ))}
                            <tr className="border-t-2 border-gray-600 bg-gray-800/40 font-semibold">
                              <td colSpan={2} className="px-3 py-2 text-gray-200">Разом</td>
                              <td className="px-3 py-2 text-right text-blue-300">{formatUSD(detailData.total_usd)}</td>
                              <td className="px-3 py-2 text-right text-yellow-400">100%</td>
                              <td className="px-3 py-2 text-right text-gray-300">
                                {detailData.senders.reduce((s, r) => s + r.decl_count, 0)}
                              </td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!detailData && !detailLoading && detailCode.length < 4 && (
            <p className="text-gray-500 text-sm text-center py-8">
              Введіть код УКТ ЗЕД (мінімум 4 цифри) та натисніть «Знайти»
            </p>
          )}
        </div>
      )}

      {/* Пошук за кодом */}
      {mainTab === 'search' && (
        <div className="space-y-4">
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
                placeholder="бренд, модель, найменування товару..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

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

          {code.length < 4 && (
            <p className="text-gray-500 text-sm text-center py-8">
              Введіть код УКТ ЗЕД (мінімум 4 цифри), щоб побачити аналіз
            </p>
          )}

          {isLoading && <p className="text-gray-400 text-center py-8">Завантаження...</p>}

          {data && (
            <div className="bg-gray-900 rounded-xl overflow-hidden">
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
                  Найменування товару
                </button>
                {isFetching && (
                  <span className="ml-auto px-4 py-3 text-blue-400 text-xs self-center">
                    Оновлення...
                  </span>
                )}
              </div>

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

              {tab === 'product' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-800 text-gray-400 text-xs uppercase">
                      <tr>
                        <th className="text-left px-4 py-3">Найменування товару</th>
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
      )}
    </div>
  )
}