import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { declarationsApi, excelDateToString, formatUSD, formatKg, type DeclarationFilters } from '../api/declarations'

const SORT_FIELDS = [
  { value: 'id', label: 'ID' },
  { value: 'declaration_date', label: 'Дата' },
  { value: 'customs_value_usd', label: 'Митна вартість' },
  { value: 'invoice_value_usd', label: 'Фактурна вартість' },
  { value: 'weight_net', label: 'Вага нетто' },
  { value: 'duty_uah', label: 'Мито' },
]

export default function DeclarationsPage() {
  const [filters, setFilters] = useState<DeclarationFilters>({ page: 1, limit: 50, sortBy: 'id', sortDir: 'asc' })
  const [expanded, setExpanded] = useState<number | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['declarations', filters],
    queryFn: () => declarationsApi.getAll(filters),
    placeholderData: prev => prev,
  })

  const { data: filterOptions } = useQuery({
    queryKey: ['filter-options'],
    queryFn: () => declarationsApi.getFilterOptions(),
    staleTime: Infinity,
  })

  const setFilter = (key: keyof DeclarationFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value || undefined, page: 1 }))
  }

  const clearFilters = () => {
    setFilters({ page: 1, limit: 50, sortBy: 'id', sortDir: 'asc' })
  }

  const toggleSort = (field: string) => {
    setFilters(prev => ({
      ...prev,
      sortBy: field,
      sortDir: prev.sortBy === field && prev.sortDir === 'asc' ? 'desc' : 'asc',
      page: 1,
    }))
  }

  const sortIcon = (field: string) => {
    if (filters.sortBy !== field) return <span className="text-gray-600 ml-1">↕</span>
    return <span className="text-blue-400 ml-1">{filters.sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-100">Декларації</h1>
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-gray-400 text-sm">
              {data.pagination.total.toLocaleString('uk-UA')} записів
            </span>
          )}
          <button
            onClick={() => setShowFilters(p => !p)}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-200 transition-colors"
          >
            {showFilters ? 'Сховати фільтри' : 'Фільтри'}
          </button>
          <button
            onClick={clearFilters}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-400 transition-colors"
          >
            Скинути
          </button>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Пошук по назві товару, отримувачу, відправнику, номеру декларації..."
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        value={filters.search ?? ''}
        onChange={e => setFilter('search', e.target.value)}
      />

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-gray-900 rounded-xl p-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Митниця</label>
            <select
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
              value={filters.customs_office ?? ''}
              onChange={e => setFilter('customs_office', e.target.value)}
            >
              <option value="">Всі</option>
              {filterOptions?.customs_offices.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-gray-400 text-xs mb-1 block">Країна торгівлі</label>
            <select
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
              value={filters.trade_country ?? ''}
              onChange={e => setFilter('trade_country', e.target.value)}
            >
              <option value="">Всі</option>
              {filterOptions?.trade_countries.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-gray-400 text-xs mb-1 block">Країна походження</label>
            <select
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
              value={filters.origin_country ?? ''}
              onChange={e => setFilter('origin_country', e.target.value)}
            >
              <option value="">Всі</option>
              {filterOptions?.origin_countries.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-gray-400 text-xs mb-1 block">Валюта</label>
            <select
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
              value={filters.currency_name ?? ''}
              onChange={e => setFilter('currency_name', e.target.value)}
            >
              <option value="">Всі</option>
              {filterOptions?.currencies.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-gray-400 text-xs mb-1 block">Умови поставки</label>
            <select
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
              value={filters.delivery_condition ?? ''}
              onChange={e => setFilter('delivery_condition', e.target.value)}
            >
              <option value="">Всі</option>
              {filterOptions?.delivery_conditions.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-gray-400 text-xs mb-1 block">Код УКТ ЗЕД</label>
            <input
              type="text"
              placeholder="3904..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
              value={filters.product_code ?? ''}
              onChange={e => setFilter('product_code', e.target.value)}
            />
          </div>

          <div>
            <label className="text-gray-400 text-xs mb-1 block">Отримувач</label>
            <input
              type="text"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
              value={filters.recipient_name ?? ''}
              onChange={e => setFilter('recipient_name', e.target.value)}
            />
          </div>

          <div>
            <label className="text-gray-400 text-xs mb-1 block">Відправник</label>
            <input
              type="text"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
              value={filters.sender_name ?? ''}
              onChange={e => setFilter('sender_name', e.target.value)}
            />
          </div>

          <div>
            <label className="text-gray-400 text-xs mb-1 block">Вартість $ від</label>
            <input
              type="number"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
              value={filters.value_usd_min ?? ''}
              onChange={e => setFilter('value_usd_min', e.target.value)}
            />
          </div>

          <div>
            <label className="text-gray-400 text-xs mb-1 block">Вартість $ до</label>
            <input
              type="number"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
              value={filters.value_usd_max ?? ''}
              onChange={e => setFilter('value_usd_max', e.target.value)}
            />
          </div>

          <div>
            <label className="text-gray-400 text-xs mb-1 block">Дата від</label>
            <input
              type="date"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
              value={filters.date_from ?? ''}
              onChange={e => setFilter('date_from', e.target.value)}
            />
          </div>

          <div>
            <label className="text-gray-400 text-xs mb-1 block">Дата до</label>
            <input
              type="date"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
              value={filters.date_to ?? ''}
              onChange={e => setFilter('date_to', e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Sort bar */}
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <span className="text-gray-500">Сортування:</span>
        {SORT_FIELDS.map(f => (
          <button
            key={f.value}
            onClick={() => toggleSort(f.value)}
            className={`px-3 py-1 rounded-lg transition-colors ${
              filters.sortBy === f.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {f.label} {sortIcon(f.value)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl overflow-hidden">
        {isLoading ? (
          <p className="text-gray-400 p-6">Завантаження...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 text-gray-400 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3 cursor-pointer" onClick={() => toggleSort('declaration_date')}>
                    Дата {sortIcon('declaration_date')}
                  </th>
                  <th className="text-left px-4 py-3">Номер декларації</th>
                  <th className="text-left px-4 py-3">Митниця</th>
                  <th className="text-left px-4 py-3">Країна</th>
                  <th className="text-left px-4 py-3">Код УКТ ЗЕД</th>
                  <th className="text-left px-4 py-3">Отримувач</th>
                  <th className="text-right px-4 py-3 cursor-pointer" onClick={() => toggleSort('weight_net')}>
                    Вага нетто {sortIcon('weight_net')}
                  </th>
                  <th className="text-right px-4 py-3 cursor-pointer" onClick={() => toggleSort('invoice_value_usd')}>
                    Фактурна $ {sortIcon('invoice_value_usd')}
                  </th>
                  <th className="text-right px-4 py-3 cursor-pointer" onClick={() => toggleSort('customs_value_usd')}>
                    Митна $ {sortIcon('customs_value_usd')}
                  </th>
                  <th className="text-right px-4 py-3 cursor-pointer" onClick={() => toggleSort('duty_uah')}>
                    Мито ₴ {sortIcon('duty_uah')}
                  </th>
                  <th className="text-right px-4 py-3">ПДВ ₴</th>
                </tr>
              </thead>
              <tbody className={isFetching ? 'opacity-60' : ''}>
               {data?.data.map(row => (
  <React.Fragment key={row.id}>
    <tr
                      key={row.id}
                      className="border-t border-gray-800 hover:bg-gray-800/50 cursor-pointer"
                      onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                    >
                      <td className="px-4 py-2 text-gray-300 whitespace-nowrap">
                        {excelDateToString(row.declaration_date)}
                      </td>
                      <td className="px-4 py-2 text-blue-400 font-mono whitespace-nowrap">
                        {row.decl_num_prefix}/{row.decl_num_year?.toFixed(0)}/{row.decl_num_number?.toFixed(0)}
                      </td>
                      <td className="px-4 py-2 text-gray-300 max-w-[180px] truncate">
                        {row.customs_office}
                      </td>
                      <td className="px-4 py-2 text-gray-300 whitespace-nowrap">
                        {row.origin_country}
                      </td>
                      <td className="px-4 py-2 text-gray-300 font-mono">
                        {row.product_code?.substring(0, 10)}
                      </td>
                      <td className="px-4 py-2 text-gray-300 max-w-[200px] truncate">
                        {row.recipient_name}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-300 whitespace-nowrap">
                        {formatKg(row.weight_net)}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-300 whitespace-nowrap">
                        {formatUSD(row.invoice_value_usd)}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-300 whitespace-nowrap">
                        {formatUSD(row.customs_value_usd)}
                      </td>
                      <td className="px-4 py-2 text-right text-yellow-400 whitespace-nowrap">
                        {formatUSD(row.duty_uah)}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-300 whitespace-nowrap">
                        {formatUSD(row.vat_uah)}
                      </td>
                    </tr>
                    {expanded === row.id && (
                      <tr key={`${row.id}-expanded`} className="border-t border-gray-700 bg-gray-800/30">
                        <td colSpan={11} className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                            <div><span className="text-gray-500">Відправник:</span> <span className="text-gray-200">{row.sender_name || '—'}</span></div>
                            <div><span className="text-gray-500">Контейнер:</span> <span className="text-gray-200">{row.container_number || '—'}</span></div>
                            <div><span className="text-gray-500">Умови поставки:</span> <span className="text-gray-200">{row.delivery_condition || '—'}</span></div>
                            <div><span className="text-gray-500">Валюта:</span> <span className="text-gray-200">{row.currency_name || '—'}</span></div>
                            <div><span className="text-gray-500">Курс:</span> <span className="text-gray-200">{row.exchange_rate || '—'}</span></div>
                            <div><span className="text-gray-500">Вага брутто:</span> <span className="text-gray-200">{formatKg(row.weight_gross)}</span></div>
                            <div className="col-span-2 md:col-span-3">
                              <span className="text-gray-500">Назва товару:</span>
                              <p className="text-gray-200 mt-1 leading-relaxed">{row.product_name || '—'}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                 </React.Fragment>
))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-gray-400 text-sm">
            Сторінка {data.pagination.page} з {data.pagination.pages}
          </p>
          <div className="flex gap-2">
            <button
              disabled={data.pagination.page <= 1}
              onClick={() => setFilters(p => ({ ...p, page: (p.page ?? 1) - 1 }))}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm text-gray-200 transition-colors"
            >
              ← Назад
            </button>
            <button
              disabled={data.pagination.page >= data.pagination.pages}
              onClick={() => setFilters(p => ({ ...p, page: (p.page ?? 1) + 1 }))}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm text-gray-200 transition-colors"
            >
              Вперед →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}