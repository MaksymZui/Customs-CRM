import { useState, useRef, useEffect } from 'react'

interface MonthSelectProps {
  months: string[]
  selected: string[]
  onChange: (selected: string[]) => void
}

export default function MonthSelect({ months, selected, onChange }: MonthSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleMonth = (month: string) => {
    if (selected.includes(month)) {
      onChange(selected.filter(m => m !== month))
    } else {
      onChange([...selected, month].sort())
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-2 text-xs text-white bg-gray-950 border border-gray-800 rounded-lg hover:bg-gray-800 focus:outline-none"
      >
        <span className="truncate">
          {selected.length > 0 ? selected.join(', ') : 'Выберите месяцы'}
        </span>
        <svg className="w-4 h-4 ml-2 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-h-60 overflow-y-auto p-2">
          {months.map(month => {
            const isSelected = selected.includes(month)
            return (
              <label
                key={month}
                className="flex items-center px-3 py-2 text-xs text-gray-200 rounded hover:bg-gray-800 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleMonth(month)}
                  className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                />
                <span className="ml-3">{month}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}