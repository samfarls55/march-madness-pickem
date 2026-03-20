import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)
const STORAGE_KEY = 'spreadness-school-theme'

// ── Color utilities ───────────────────────────────────────────────
// Minimum lightness for accent colors so they stay visible on the
// dark (#111) background. Hue + saturation are preserved so the color
// still clearly reads as that school's color.
const MIN_L = 35  // percent — dark enough to feel rich, light enough to see
const MAX_L = 82  // percent — cap very pale colors so white button text stays legible

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

// Clamp lightness into [MIN_L, MAX_L].
//
// When boosting a dark color, saturation is reduced proportionally to
// the lightness increase. Without this, a deep maroon like Virginia
// Tech's #630031 (H=339°, S=100%, L=19%) would become vivid pink at
// L=35% with S still at 100%. By scaling S down by the same ratio
// that L is scaled up, the color stays in the same perceptual family
// (rich maroon → wine rather than maroon → pink).
function clampColor(hex) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return hex
  const [h, s, l] = hexToHsl(hex)

  if (l < MIN_L) {
    const boostRatio = MIN_L / l
    const newS = s / boostRatio   // scale saturation down by same factor
    return hslToHex(h, newS, MIN_L)
  }

  if (l > MAX_L) {
    return hslToHex(h, s, MAX_L)
  }

  return hex
}

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
      root.style.setProperty('--accent',  clampColor(school.primary))
      root.style.setProperty('--accent2', clampColor(school.secondary))
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
