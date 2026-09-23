import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../api/client'
import { formatUSD, formatKg } from '../api/declarations'
import MonthSelect from '../components/MonthSelect' // Использование готового компонента из вашей структуры

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

type Tab = 'brand' | 'product'
type MainTab = 'search' | 'growth-report'

export default function AnalyticsPage() {
  const [mainTab, setMainTab] = useState<MainTab>('search')

  // Состояние для поиска по коду
  const [code, setCode] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('brand')

  // Состояние для выбора месяцев в отчете роста
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [baseMonths, setBaseMonths] = useState<string[]>([])
  const [compareMonths, setCompareMonths] = useState<string[]>([])

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

  // Загрузка доступных месяцев при открытии вкладки отчета роста
  useEffect(() => {
    if (mainTab === 'growth-report') {
      api.get<string[]>('/analytics/available-months').then(res => {
        setAvailableMonths(res.data)
        if (res.data.length >= 6 && baseMonths.length === 0) {
          setCompareMonths(res.data.slice(0, 3)) // последние 3 месяца
          setBaseMonths(res.data.slice(3, 6))   // предыдущие 3 месяца
        }
      })
    }
  }, [mainTab])

  // Запрос данных отчета роста с бэкенда
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

  // Запрос поиска по УКТ ЗЕД
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['analytics-uktved', code, importId],
    queryFn: () =>
      api.get<AnalyticsResponse>('/analytics/uktved', {
        params: { code, importId },
      }).then(r => r.data),
    enabled: mainTab === 'search' && code.length >= 4,
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
      <h1 className="text-2xl font-bold text-gray-100">Анализ по УКТ ВЭД</h1>

      {/* Главный переключатель режимов страницы */}
      <div className="flex border-b border-gray-800 gap-4">
        <button
          onClick={() => setMainTab('search')}
          className={`pb-2 text-sm font-medium transition-colors ${
            mainTab === 'search'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          🔍 Поиск по коду
        </button>
        <button
          onClick={() => setMainTab('growth-report')}
          className={`pb-2 text-sm font-medium transition-colors ${
            mainTab === 'growth-report'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          📈 Отчет роста импорта (ТОП-50)
        </button>
      </div>

      {/* Условие: Режим отчета роста */}
      {mainTab === 'growth-report' ? (
        <div className="space-y-6">
          <div className="bg-gray-900 p-4 rounded-xl border border-gray-800 space-y-4">
            <h2 className="text-md font-semibold text-gray-200">Выберите месяцы для сравнения</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-xs text-gray-400 block mb-2 font-medium">
                  Базовый период: {baseMonths.join(', ') || 'не выбрано'}
                </label>
                <MonthSelect
                  months={availableMonths}
                  selected={baseMonths}
                  onChange={setBaseMonths}
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-2 font-medium">
                  Сравниваемый период: {compareMonths.join(', ') || 'не выбрано'}
                </label>
                <MonthSelect
                  months={availableMonths}
                  selected={compareMonths}
                  onChange={setCompareMonths}
                />
              </div>
            </div>
          </div>

          {growthLoading && <p className="text-gray-400 text-center py-8">Формирование отчета...</p>}

          {growthData && (
            <div className="bg-gray-900 rounded-xl overflow-x-auto border border-gray-800">
              <table className="w-full text-xs text-left text-gray-300">
                <thead className="bg-gray-800 text-gray-200 uppercase">
                  <tr>
                    <th className="px-4 py-3">УКТ ВЭД (4 знака)</th>
                    <th className="px-4 py-3 text-right">Баз. период $</th>
                    <th className="px-4 py-3 text-right">Сравн. период $</th>
                    <th className="px-4 py-3 text-right">Рост $</th>
                    <th className="px-4 py-3 text-right">Рост %</th>
                    <th className="px-4 py-3 text-right">Декл. баз.</th>
                    <th className="px-4 py-3 text-right">Декл. сравн.</th>
                    <th className="px-4 py-3 text-right">Рост декл. %</th>
                  </tr>
                </thead>
                <tbody>
                  {growthData.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center text-gray-500 py-8">
                        Нет данных для выбранных периодов
                      </td>
                    </tr>
                  ) : (
                    growthData.map((row) => (
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
      ) : (
        /* Режим поиска по УКТ ВЭД */
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-gray-400 text-xs mb-1 block">Код УКТ ВЭД (минимум 4 цифры)</label>
              <input
                type="text"
                placeholder="например: 8525890010"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div className="flex-1">
              <label className="text-gray-400 text-xs mb-1 block">Поиск</label>
              <input
                type="text"
                placeholder="бренд, модель, наименование товара..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {data && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Деклараций', value: data.totals.declarations.toLocaleString('ru-RU') },
                { label: 'Общее количество', value: data.totals.total_qty ? `${data.totals.total_qty.toLocaleString('ru-RU')} шт` : '—' },
                { label: 'Общий вес', value: formatKg(data.totals.total_weight) },
                { label: 'Общая стоимость', value: formatUSD(data.totals.total_value_usd) },
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
              Введите код УКТ ВЭД (минимум 4 цифры), чтобы увидеть анализ
            </p>
          )}

          {isLoading && <p className="text-gray-400 text-center py-8">Загрузка...</p>}

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
                  Наименование товара
                </button>
                {isFetching && (
                  <span className="ml-auto px-4 py-3 text-blue-400 text-xs self-center">
                    Обновление...
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
                        <th className="text-right px-4 py-3">Деклараций</th>
                        <th className="text-right px-4 py-3">Количество</th>
                        <th className="text-right px-4 py-3">Вес нетто</th>
                        <th className="text-right px-4 py-3">Стоимость $</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBrand.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center text-gray-500 py-8">
                            {data.by_brand_model.length === 0
                              ? 'Бренды не распознаны — данные появятся после следующего импорта'
                              : 'Ничего не найдено'}
                          </td>
                        </tr>
                      ) : (
                        filteredBrand.map((row, i) => (
                          <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/50">
                            <td className="px-4 py-3 text-blue-300 font-medium">{row.brand}</td>
                            <td className="px-4 py-3 text-gray-300">{row.model}</td>
                            <td className="px-4 py-3 text-right text-gray-300">{row.count.toLocaleString('ru-RU')}</td>
                            <td className="px-4 py-3 text-right text-gray-300">
                              {row.total_qty ? `${row.total_qty.toLocaleString('ru-RU')} ${row.unit_name || 'шт'}` : '—'}
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
                        <th className="text-left px-4 py-3">Наименование товара</th>
                        <th className="text-right px-4 py-3">Деклараций</th>
                        <th className="text-right px-4 py-3">Количество</th>
                        <th className="text-right px-4 py-3">Вес нетто</th>
                        <th className="text-right px-4 py-3">Стоимость $</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProduct.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-center text-gray-500 py-8">Ничего не найдено</td>
                        </tr>
                      ) : (
                        filteredProduct.map((row, i) => (
                          <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/50">
                            <td className="px-4 py-3 text-gray-300 max-w-[600px]">
                              <p className="line-clamp-3 text-xs leading-relaxed">{row.product_name}</p>
                            </td>
                            <td className="px-4 py-3 text-right text-gray-300">{row.count.toLocaleString('ru-RU')}</td>
                            <td className="px-4 py-3 text-right text-gray-300">
                              {row.total_qty ? `${row.total_qty.toLocaleString('ru-RU')} ${row.unit_name || 'шт'}` : '—'}
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