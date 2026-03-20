import { useState, useEffect, useRef } from 'react'
import { SCHOOL_COLORS } from '../data/schoolColors'
import { useTheme } from '../context/ThemeContext'

export function SchoolPicker({ onClose }) {
  const { school, setSchool, clearSchool } = useTheme()
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = query.trim()
    ? SCHOOL_COLORS.filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
    : SCHOOL_COLORS

  function pick(s) {
    setSchool(s)
    onClose()
  }

  function reset() {
    clearSchool()
    onClose()
  }

  return (
    <div className="sp-backdrop" onClick={onClose}>
      <div className="sp-modal" onClick={e => e.stopPropagation()}>
        <div className="sp-header">
          <h2 className="sp-title">Choose your team</h2>
          <button className="sp-close" onClick={onClose}>✕</button>
        </div>

        <div className="sp-search-wrap">
          <input
            ref={inputRef}
            className="field-input sp-search"
            type="text"
            placeholder="Search schools…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        <div className="sp-list">
          {!query && (
            <button
              className={`sp-item sp-item-default ${!school ? 'sp-item-active' : ''}`}
              onClick={reset}
            >
              <span className="sp-swatches">
                <span className="sp-swatch" style={{ background: '#f97316' }} />
                <span className="sp-swatch" style={{ background: '#22d3ee' }} />
              </span>
              <span className="sp-name">Default theme</span>
              {!school && <span className="sp-check">✓</span>}
            </button>
          )}

          {filtered.length === 0 && (
            <p className="sp-empty">No schools match "{query}"</p>
          )}

          {filtered.map(s => {
            const active = school?.name === s.name
            return (
              <button key={s.name} className={`sp-item ${active ? 'sp-item-active' : ''}`} onClick={() => pick(s)}>
                <span className="sp-swatches">
                  <span className="sp-swatch" style={{ background: s.primary }} />
                  <span className="sp-swatch" style={{ background: s.secondary }} />
                </span>
                <span className="sp-name">{s.name}</span>
                {active && <span className="sp-check">✓</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
