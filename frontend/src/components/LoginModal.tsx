import React, { useState } from 'react'

interface LoginModalProps {
  onSuccess: () => void
}

export const LoginModal: React.FC<LoginModalProps> = ({ onSuccess }) => {
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