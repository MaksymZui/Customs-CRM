import { Routes, Route, NavLink } from 'react-router-dom'
import DeclarationsPage from './pages/DeclarationsPage'
import ImportPage from './pages/ImportPage'
import StatsPage from './pages/StatsPage'

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-6">
        <span className="text-blue-400 font-bold text-lg mr-4">Customs CRM</span>
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