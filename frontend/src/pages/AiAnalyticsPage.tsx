import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import api from '../api/client'
import { formatUSD, formatKg } from '../api/declarations'

interface AiResult {
  brand: string
  model: string
  count: number
  total_qty: number | null
  total_weight: number | null
  total_value_usd: number | null
}

interface AiResponse {
  results: AiResult[]
  cached: number
  new: number
}

export default function AiAnalyticsPage() {
  const [code, setCode] = useState('')
  const [recipientCode, setRecipientCode] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [importId, setImportId] = useState(
    localStorage.getItem('selectedImportId') || 'latest'
  )

  useEffect(() => {
    const handler = () => setImportId(localStorage.getItem('selectedImportId') || 'latest')
    window.addEventListener('importFilterChanged', handler)
    return () => window.removeEventListener('importFilterChanged', handler)
  }, [])

  const { mutate, data, isPending, isError } = useMutation({
    mutationFn: () =>
      api.post<AiResponse>('/ai/analyze-uktved', {
        code,
        importId,
        recipient_code: recipientCode || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }).then(r => r.data),
  })

  const filtered = data?.results.filter(r =>
    !search ||
    r.brand.toLowerCase().includes(search.toLowerCase()) ||
    r.model.toLowerCase().includes(search.toLowerCase())
  ) ?? []

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-100">AI Аналітика</h1>
        <span className="px-2 py-1 bg-blue-600/20 text-blue-400 text-xs rounded-full border border-blue-600/30">
          Gemini
        </span>
      </div>

      <p className="text-gray-400 text-sm">
        AI аналізує назви товарів з митних декларацій і витягує бренд, модель та кількість.
        Результати кешуються — повторний запит по тому самому коду безкоштовний.
      </p>

      {/* Filters */}
      <div className="bg-gray-900 rounded-xl p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="text-gray-400 text-xs mb-1 block">Код УКТ ЗЕД</label>
          <input
            type="text"
            placeholder="наприклад: 8525890010"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <div>
          <label className="text-gray-400 text-xs mb-1 block">Код фірми отримувача</label>
          <input
            type="text"
            placeholder="44287456"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
            value={recipientCode}
            onChange={e => setRecipientCode(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <div>
          <label className="text-gray-400 text-xs mb-1 block">Дата від</label>
          <input
            type="date"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="text-gray-400 text-xs mb-1 block">Дата до</label>
          <input
            type="date"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Пошук по бренду або моделі..."
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button
          onClick={() => mutate()}
          disabled={code.length < 4 || isPending}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          {isPending ? (
            <>
              <span className="animate-spin">⟳</span>
              Аналізую...
            </>
          ) : (
            <>✨ Аналізувати</>
          )}
        </button>
      </div>

      {isError && (
        <div className="bg-red-900/20 border border-red-700 rounded-xl p-4 text-red-400">
          Помилка запиту до Gemini API. Перевір API ключ.
        </div>
      )}

      {isPending && (
        <div className="bg-gray-900 rounded-xl p-8 text-center">
          <div className="text-4xl mb-3">🤖</div>
          <p className="text-gray-300 font-medium">AI аналізує митні декларації...</p>
          <p className="text-gray-500 text-sm mt-1">Може зайняти 15-30 секунд</p>
        </div>
      )}

      {data && (
        <>
          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span>Знайдено: <span className="text-gray-200">{data.results.length}</span> позицій</span>
            <span>З кешу: <span className="text-green-400">{data.cached}</span></span>
            <span>Нових запитів: <span className="text-blue-400">{data.new}</span></span>
          </div>

          {/* Table */}
          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800">
              <h2 className="font-semibold text-gray-200">
                Бренд / Модель по коду {code}
                {search && <span className="text-gray-400 text-sm ml-2">({filtered.length} з {data.results.length})</span>}
              </h2>
            </div>
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
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-gray-500 py-8">
                        Нічого не знайдено
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row, i) => (
                      <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-blue-300 font-medium">{row.brand}</td>
                        <td className="px-4 py-3 text-gray-300">{row.model}</td>
                        <td className="px-4 py-3 text-right text-gray-300">
                          {row.count.toLocaleString('uk-UA')}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300">
                          {row.total_qty ? `${row.total_qty.toLocaleString('uk-UA')} шт` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300">
                          {formatKg(row.total_weight)}
                        </td>
                        <td className="px-4 py-3 text-right text-blue-400 font-medium">
                          {formatUSD(row.total_value_usd)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}