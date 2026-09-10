import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../api/client'
import { formatUSD, formatUAH, formatKg } from '../api/declarations'

interface Stats {
  totals: {
    declarations: number
    invoice_usd: number
    customs_usd: number
    duty_uah: number
    vat_uah: number
    weight_net_kg: number
  }
  top_recipients: { name: string; total: number }[]
  top_countries: { name: string; total: number }[]
  top_products: { code: string; total: number; count: number }[]
}

export default function StatsPage() {
  const [importId, setImportId] = useState<string>(() => localStorage.getItem('selectedImportId') || 'latest')

  // Слушаем изменения импорта в шапке CRM
  useEffect(() => {
    const handleImportChange = () => {
      setImportId(localStorage.getItem('selectedImportId') || 'latest')
    }

    window.addEventListener('importFilterChanged', handleImportChange)
    return () => {
      window.removeEventListener('importFilterChanged', handleImportChange)
    }
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['stats', importId],
    queryFn: () => api.get<Stats>('/stats', { params: { importId } }).then(r => r.data),
  })

  if (isLoading) return <p className="text-gray-400">Завантаження...</p>
  if (!data) return <p className="text-gray-400">Немає даних</p>

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-100">Статистика</h1>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Декларацій', value: data.totals.declarations.toLocaleString('uk-UA') },
          { label: 'Фактурна вартість', value: formatUSD(data.totals.invoice_usd) },
          { label: 'Митна вартість', value: formatUSD(data.totals.customs_usd) },
          { label: 'Мито', value: formatUAH(data.totals.duty_uah) },
          { label: 'ПДВ', value: formatUAH(data.totals.vat_uah) },
          { label: 'Вага нетто', value: formatKg(data.totals.weight_net_kg) },
        ].map(card => (
          <div key={card.label} className="bg-gray-900 rounded-xl p-5">
            <p className="text-gray-400 text-sm mb-1">{card.label}</p>
            <p className="text-gray-100 text-xl font-semibold">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Top recipients */}
        <div className="bg-gray-900 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800">
            <h2 className="font-semibold text-gray-200">Топ отримувачі</h2>
          </div>
          <div className="divide-y divide-gray-800">
            {data.top_recipients.map((r, i) => (
              <div key={i} className="px-5 py-3 flex justify-between gap-2">
                <span className="text-gray-300 text-sm truncate">{r.name}</span>
                <span className="text-blue-400 text-sm whitespace-nowrap">{formatUSD(r.total)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top countries */}
        <div className="bg-gray-900 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800">
            <h2 className="font-semibold text-gray-200">Топ країни походження</h2>
          </div>
          <div className="divide-y divide-gray-800">
            {data.top_countries.map((r, i) => (
              <div key={i} className="px-5 py-3 flex justify-between gap-2">
                <span className="text-gray-300 text-sm truncate">{r.name}</span>
                <span className="text-blue-400 text-sm whitespace-nowrap">{formatUSD(r.total)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top products */}
        <div className="bg-gray-900 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800">
            <h2 className="font-semibold text-gray-200">Топ коди УКТ ЗЕД</h2>
          </div>
          <div className="divide-y divide-gray-800">
            {data.top_products.map((r, i) => (
              <div key={i} className="px-5 py-3 flex justify-between gap-2">
                <span className="text-gray-300 text-sm font-mono">{r.code}</span>
                <span className="text-blue-400 text-sm whitespace-nowrap">{formatUSD(r.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}