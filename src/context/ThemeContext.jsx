import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)

const STORAGE_KEY = 'spreadness-school-theme'

export function ThemeProvider({ children }) {
  const [school, setSchoolState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    const root = document.documentElement
    if (school) {
      root.style.setProperty('--accent',  school.primary)
      root.style.setProperty('--accent2', school.secondary)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(school))
    } else {
      root.style.removeProperty('--accent')
      root.style.removeProperty('--accent2')
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [school])

  function setSchool(s) { setSchoolState(s) }
  function clearSchool() { setSchoolState(null) }

  return (
    <ThemeContext.Provider value={{ school, setSchool, clearSchool }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
