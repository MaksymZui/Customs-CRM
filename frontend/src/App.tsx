import React, { useState, useEffect } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import DeclarationsPage from './pages/DeclarationsPage'
import ImportPage from './pages/ImportPage'
import StatsPage from './pages/StatsPage'

interface ImportJob {
  id: string
  filename: string
  created_at: string
  status: string
}

function LoginModal({ onSuccess }: { onSuccess: () => void }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: login, password }),
      })
      const data = await response.json()
      
      if (data.success) {
        localStorage.setItem('isAuthenticated', 'true')
        onSuccess()
      } else {
        setError(data.message || 'Невірний логін або пароль')
      }
    } catch (err) {
      setError('Помилка підключення до сервера')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md p-8 bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">Авторизація в Customs CRM</h2>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Логін</label>
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <button
            type="submit"
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors"
          >
            Увійти
          </button>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  const [isAuth, setIsAuth] = useState(false)
  const [jobs, setJobs] = useState<ImportJob[]>([])
  const [selectedImport, setSelectedImport] = useState<string>(
    localStorage.getItem('selectedImportId') || 'latest'
  )

  useEffect(() => {
    const authStatus = localStorage.getItem('isAuthenticated')
    if (authStatus === 'true') {
      setIsAuth(true)
    }
  }, [])

  useEffect(() => {
    if (isAuth) {
      fetch('/api/import/jobs')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setJobs(data)
        })
        .catch((err) => console.error(err))
    }
  }, [isAuth])

  const handleImportChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    setSelectedImport(value)
    localStorage.setItem('selectedImportId', value)
    window.dispatchEvent(new Event('importFilterChanged'))
  }

  if (!isAuth) {
    return <LoginModal onSuccess={() => setIsAuth(true)} />
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-6">
          <span className="text-blue-400 font-bold text-lg mr-2">Customs CRM</span>
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              isActive ? 'text-blue-400 font-medium' : 'text-gray-400 hover:text-gray-100'
            }
          >
            Декларації
          </NavLink>
          <NavLink
            to="/import"
            className={({ isActive }) =>
              isActive ? 'text-blue-400 font-medium' : 'text-gray-400 hover:text-gray-100'
            }
          >
            Імпорт
          </NavLink>
          <NavLink
            to="/stats"
            className={({ isActive }) =>
              isActive ? 'text-blue-400 font-medium' : 'text-gray-400 hover:text-gray-100'
            }
          >
            Статистика
          </NavLink>
        </div>

        <div className="flex items-center gap-3 bg-gray-800/80 px-3 py-1.5 rounded-lg border border-gray-700/60">
          <span className="text-xs font-medium text-gray-400">Джерело:</span>
          <select
            value={selectedImport}
            onChange={handleImportChange}
            className="bg-gray-900 border border-gray-700 text-white text-xs rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500"
          >
            <option value="latest">⚡ Останній завантажений файл</option>
            <option value="all">🌐 Обрати всі файли (Вся база)</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.filename} ({new Date(job.created_at).toLocaleString()})
              </option>
            ))}
          </select>
        </div>
      </nav>

      <main className="p-6">
        <Routes>
          <Route path="/" element={<DeclarationsPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/stats" element={<StatsPage />} />
        </Routes>
      </main>
    </div>
  )
}