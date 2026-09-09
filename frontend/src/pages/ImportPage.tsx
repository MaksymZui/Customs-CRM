import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../api/client'

interface ImportJob {
  id: string
  filename: string
  status: string
  total_rows: number | null
  processed: number
  error: string | null
  created_at: string
  finished_at: string | null
}

interface ProgressEvent {
  status: string
  processed: number
  total: number | null
  error: string | null
}

export default function ImportPage() {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  const { data: jobs, refetch } = useQuery({
    queryKey: ['import-jobs'],
    queryFn: () => api.get<ImportJob[]>('/import').then(r => r.data),
    refetchInterval: activeJobId ? 3000 : false,
  })

  useEffect(() => {
    if (!activeJobId) return

    const es = new EventSource(`/api/import/${activeJobId}/status`)
    eventSourceRef.current = es

    es.onmessage = (e) => {
      const data: ProgressEvent = JSON.parse(e.data)
      setProgress(data)
      if (data.status === 'done' || data.status === 'error') {
        es.close()
        setActiveJobId(null)
        refetch()
      }
    }

    es.onerror = () => es.close()

    return () => es.close()
  }, [activeJobId, refetch])

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.xlsb') && !file.name.endsWith('.xlsx')) {
      alert('Тільки .xlsb або .xlsx файли')
      return
    }

    setUploading(true)
    setProgress(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await api.post<{ job_id: string }>('/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setActiveJobId(res.data.job_id)
      refetch()
    } catch (err) {
      alert('Помилка завантаження')
    } finally {
      setUploading(false)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const pct = progress?.total ? Math.round((progress.processed / progress.total) * 100) : 0

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      pending: 'Очікування',
      processing: 'Обробка',
      done: 'Готово',
      error: 'Помилка',
    }
    return map[status] || status
  }

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      pending: 'text-yellow-400',
      processing: 'text-blue-400',
      done: 'text-green-400',
      error: 'text-red-400',
    }
    return map[status] || 'text-gray-400'
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-100">Імпорт файлу</h1>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          dragging ? 'border-blue-400 bg-blue-950' : 'border-gray-700 hover:border-gray-500'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsb,.xlsx"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <div className="text-5xl mb-4">📂</div>
        <p className="text-gray-300 text-lg">
          {uploading ? 'Завантаження...' : 'Перетягни .xlsb файл або клікни для вибору'}
        </p>
        <p className="text-gray-500 text-sm mt-2">Максимум 500 МБ</p>
      </div>

      {/* Progress */}
      {progress && (
        <div className="bg-gray-900 rounded-xl p-5 space-y-3">
          <div className="flex justify-between text-sm">
            <span className={statusColor(progress.status)}>{statusLabel(progress.status)}</span>
            <span className="text-gray-400">
              {progress.processed.toLocaleString()} / {progress.total?.toLocaleString() ?? '?'} рядків
            </span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-3">
            <div
              className="bg-blue-500 h-3 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-right text-sm text-gray-400">{pct}%</div>
          {progress.error && (
            <p className="text-red-400 text-sm">{progress.error}</p>
          )}
        </div>
      )}

      {/* History */}
      <div className="bg-gray-900 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <h2 className="font-semibold text-gray-200">Історія імпортів</h2>
        </div>
        {!jobs?.length ? (
          <p className="text-gray-500 text-sm p-5">Немає імпортів</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-gray-400">
              <tr>
                <th className="text-left px-4 py-2">Файл</th>
                <th className="text-left px-4 py-2">Статус</th>
                <th className="text-right px-4 py-2">Рядків</th>
                <th className="text-left px-4 py-2">Дата</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id} className="border-t border-gray-800 hover:bg-gray-800/50">
                  <td className="px-4 py-2 text-gray-200">{job.filename}</td>
                  <td className={`px-4 py-2 ${statusColor(job.status)}`}>{statusLabel(job.status)}</td>
                  <td className="px-4 py-2 text-right text-gray-300">
                    {job.processed.toLocaleString()}
                    {job.total_rows ? ` / ${job.total_rows.toLocaleString()}` : ''}
                  </td>
                  <td className="px-4 py-2 text-gray-400">
                    {new Date(job.created_at).toLocaleString('uk-UA')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}