import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)
const STORAGE_KEY = 'spreadness-school-theme'

// ── Color utilities ───────────────────────────────────────────────
function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return [h * 360, s * 100, l * 100]
}

function hslToHex(h, s, l) {
  h /= 360; s /= 100; l /= 100
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  let r, g, b
  if (s === 0) {
    r = g = b = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }
  return '#' + [r, g, b].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('')
}

// Derive dark surface colors from the school's primary hue.
// Uses a subtle fraction of the hue's saturation so backgrounds feel
// like that school's color family without competing with the accents.
function deriveSurfaces(primaryHex) {
  const [h, s] = hexToHsl(primaryHex)
  const ss = Math.min(s * 0.28, 32) // ~28% of original saturation, capped at 32%
  return {
    bg:       hslToHex(h, ss,        5),
    surface:  hslToHex(h, ss * 0.85, 9),
    surface2: hslToHex(h, ss * 0.65, 13),
    border:   hslToHex(h, ss * 0.85, 20),
  }
}

const THEMED_PROPS = ['--accent', '--accent2', '--bg', '--surface', '--surface2', '--border']

// ── Context ───────────────────────────────────────────────────────
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
      const surfaces = deriveSurfaces(school.primary)
      root.style.setProperty('--accent',   school.primary)
      root.style.setProperty('--accent2',  school.secondary)
      root.style.setProperty('--bg',       surfaces.bg)
      root.style.setProperty('--surface',  surfaces.surface)
      root.style.setProperty('--surface2', surfaces.surface2)
      root.style.setProperty('--border',   surfaces.border)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(school))
    } else {
      THEMED_PROPS.forEach(p => root.style.removeProperty(p))
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
