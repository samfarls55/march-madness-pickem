import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

function isoDate(d) { return d.toISOString().split('T')[0] }
function shiftDate(str, days) {
  const d = new Date(str + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return isoDate(d)
}

const TODAY = isoDate(new Date())

const ROUND_ORDER = [
  'first_four',
  'round_of_64',
  'round_of_32',
  'sweet_sixteen',
  'elite_eight',
  'final_four',
  'championship',
]

const ROUND_LABELS = {
  first_four:    'First Four',
  round_of_64:   'Round of 64',
  round_of_32:   'Round of 32',
  sweet_sixteen: 'Sweet Sixteen',
  elite_eight:   'Elite Eight',
  final_four:    'Final Four',
  championship:  'Championship',
}

export default function Admin() {
  const [viewDate, setViewDate]   = useState(TODAY)
  const [games, setGames]         = useState([])
  const [users, setUsers]         = useState([])
  const [picks, setPicks]         = useState([])
  const [results, setResults]     = useState({})
  const [overrides, setOverrides] = useState({})
  const [saving, setSaving]       = useState({})
  const [error, setError]         = useState(null)
  const [loading, setLoading]     = useState(true)

  // Round dates
  const [rdEdits, setRdEdits]   = useState({})
  const [rdSaving, setRdSaving] = useState({})
  const [rdSuccess, setRdSuccess] = useState({})

  useEffect(() => { loadAll(viewDate) }, [viewDate])

  async function loadAll(date) {
    setLoading(true)
    const [{ data: g }, { data: u }, { data: p }, { data: r }, { data: rd }] = await Promise.all([
      supabase.from('games').select('*').eq('date', date).order('tip_off_time'),
      supabase.from('users').select('*').order('name'),
      supabase.from('picks').select('*, games(date)').eq('games.date', date),
      supabase.from('results').select('*, games(date)').eq('games.date', date),
      supabase.from('round_dates').select('*'),
    ])
    setGames(g || [])
    setUsers(u || [])
    setPicks(p || [])
    const rMap = {}
    for (const row of r || []) rMap[row.game_id] = row
    setResults(rMap)

    const edits = {}
    for (const row of rd || []) edits[row.round] = (row.dates || []).join(', ')
    setRdEdits(edits)
    setLoading(false)
  }

  async function saveRoundDates(round) {
    setRdSaving(s => ({ ...s, [round]: true }))
    setRdSuccess(s => ({ ...s, [round]: false }))
    setError(null)
    const raw = rdEdits[round] || ''
    const dates = raw.split(',').map(d => d.trim()).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    const { error: err } = await supabase
      .from('round_dates')
      .upsert({ round, dates }, { onConflict: 'round' })
    if (err) {
      setError(`Failed to save ${ROUND_LABELS[round]}: ${err.message}`)
    } else {
      setRdSuccess(s => ({ ...s, [round]: true }))
      setTimeout(() => setRdSuccess(s => ({ ...s, [round]: false })), 2500)
    }
    setRdSaving(s => ({ ...s, [round]: false }))
  }

  async function toggleLock(game) {
    await supabase.from('games').update({ is_locked: !game.is_locked }).eq('id', game.id)
    setGames(prev => prev.map(g => g.id === game.id ? { ...g, is_locked: !g.is_locked } : g))
  }

  async function toggleTournament(game) {
    const next = !game.is_tournament_game
    await supabase.from('games').update({ is_tournament_game: next }).eq('id', game.id)
    setGames(prev => prev.map(g => g.id === game.id ? { ...g, is_tournament_game: next } : g))
  }

  function updateOverride(gameId, field, value) {
    setOverrides(prev => ({ ...prev, [gameId]: { ...prev[gameId], [field]: value } }))
  }

  async function saveResult(game) {
    const o = overrides[game.id] || {}
    if (!o.home_score || !o.away_score || !o.winner) {
      setError(`Fill in all result fields for ${game.home_team} vs ${game.away_team}`)
      return
    }
    setSaving(prev => ({ ...prev, [game.id]: true }))
    setError(null)

    const resultRow = {
      game_id: game.id,
      home_score: parseInt(o.home_score),
      away_score: parseInt(o.away_score),
      winning_team_vs_spread: o.winner,
      finalized_at: new Date().toISOString(),
    }

    const { error: rErr } = await supabase
      .from('results')
      .upsert(resultRow, { onConflict: 'game_id' })
    if (rErr) { setError(rErr.message); setSaving(prev => ({ ...prev, [game.id]: false })); return }

    const gamePicks = picks.filter(p => p.game_id === game.id)
    for (const pick of gamePicks) {
      await supabase.from('picks').update({
        is_correct: pick.picked_team === o.winner,
        points_awarded: pick.picked_team === o.winner ? pointsForRound(game.round) : 0,
      }).eq('id', pick.id)
    }

    setSaving(prev => ({ ...prev, [game.id]: false }))
    await loadAll(viewDate)
  }

  function pointsForRound(round) {
    const map = { first_four: 1, round_of_64: 1, round_of_32: 1, sweet_sixteen: 2, elite_eight: 3, final_four: 4, championship: 5 }
    return map[round] ?? 0
  }

  const submittedSet = new Set(picks.map(p => `${p.user_id}:${p.game_id}`))
  const dateLabel = viewDate === TODAY ? `Today · ${viewDate}` : viewDate

  if (loading) return <div className="page-shell"><div className="spinner" /></div>

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin</h1>
          <p className="page-subtitle">{dateLabel}</p>
        </div>
        <div className="admin-date-nav">
          <button className="btn-secondary sm" onClick={() => setViewDate(d => shiftDate(d, -1))}>‹</button>
          <button className="btn-secondary sm" onClick={() => setViewDate(TODAY)} disabled={viewDate === TODAY}>Today</button>
          <button className="btn-secondary sm" onClick={() => setViewDate(d => shiftDate(d, 1))}>›</button>
        </div>
      </div>

      {error && <div className="auth-message error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* ── Round date configuration ──────────────────────────── */}
      <section className="admin-section">
        <h2 className="admin-section-title">Tournament schedule</h2>
        <p className="muted" style={{ fontSize: '0.82rem', marginBottom: '1rem' }}>
          Set which calendar dates belong to each round. Separate multiple dates with commas (YYYY-MM-DD).
        </p>
        <div className="rd-grid">
          {ROUND_ORDER.map(round => (
            <div key={round} className="rd-row">
              <span className="rd-label">{ROUND_LABELS[round]}</span>
              <input
                className="field-input rd-input"
                type="text"
                placeholder="YYYY-MM-DD, YYYY-MM-DD"
                value={rdEdits[round] ?? ''}
                onChange={e => setRdEdits(ed => ({ ...ed, [round]: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && saveRoundDates(round)}
              />
              <button
                className={`btn-primary sm ${rdSuccess[round] ? 'saved' : ''}`}
                onClick={() => saveRoundDates(round)}
                disabled={rdSaving[round]}
              >
                {rdSaving[round] ? '…' : rdSuccess[round] ? 'Saved ✓' : 'Save'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Submission status matrix ──────────────────────────── */}
      <section className="admin-section">
        <h2 className="admin-section-title">Submission status</h2>
        {games.filter(g => g.is_tournament_game).length === 0 ? (
          <p className="muted">No tournament games on this date.</p>
        ) : (
          <div className="admin-matrix-wrap">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th className="matrix-th">Player</th>
                  {games.filter(g => g.is_tournament_game).map(g => (
                    <th key={g.id} className="matrix-th center">
                      {g.away_team.split(' ').pop()}<br />vs<br />{g.home_team.split(' ').pop()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td className="matrix-td">{u.name}</td>
                    {games.filter(g => g.is_tournament_game).map(g => (
                      <td key={g.id} className="matrix-td center">
                        <span className={`matrix-dot ${submittedSet.has(`${u.id}:${g.id}`) ? 'green' : 'red'}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Games: tournament flag, lock/unlock + score override ── */}
      <section className="admin-section">
        <h2 className="admin-section-title">Games &amp; scores</h2>
        {games.length === 0 ? (
          <p className="muted">No games on this date.</p>
        ) : (
          <div className="admin-games">
            {games.map(game => {
              const res = results[game.id]
              const o = overrides[game.id] || {}
              return (
                <div key={game.id} className={`admin-game-card ${game.is_tournament_game ? 'tournament' : 'non-tournament'}`}>
                  <div className="admin-game-header">
                    <span className="admin-game-matchup">
                      {game.away_team} <span className="muted">vs</span> {game.home_team}
                    </span>
                    <div className="admin-game-toggles">
                      <button
                        className={`lock-toggle ${game.is_tournament_game ? 'open' : 'locked'}`}
                        onClick={() => toggleTournament(game)}
                        title="Toggle NCAA tournament game"
                      >
                        {game.is_tournament_game ? '🏀 Tournament' : '— Non-tournament'}
                      </button>
                      <button
                        className={`lock-toggle ${game.is_locked ? 'locked' : 'open'}`}
                        onClick={() => toggleLock(game)}
                      >
                        {game.is_locked ? '🔒 Locked' : '🔓 Open'}
                      </button>
                    </div>
                  </div>
                  {game.is_tournament_game && (
                    res ? (
                      <div className="admin-result-display">
                        <span className="result-score">{res.away_score} – {res.home_score}</span>
                        <span className="result-winner">ATS winner: {res.winning_team_vs_spread}</span>
                        <span className="result-final">Finalized</span>
                      </div>
                    ) : (
                      <div className="admin-override">
                        <input className="field-input sm" type="number" placeholder="Away score"
                          value={o.away_score || ''} onChange={e => updateOverride(game.id, 'away_score', e.target.value)} />
                        <input className="field-input sm" type="number" placeholder="Home score"
                          value={o.home_score || ''} onChange={e => updateOverride(game.id, 'home_score', e.target.value)} />
                        <select className="field-input sm" value={o.winner || ''}
                          onChange={e => updateOverride(game.id, 'winner', e.target.value)}>
                          <option value="">ATS winner…</option>
                          <option value={game.away_team}>{game.away_team}</option>
                          <option value={game.home_team}>{game.home_team}</option>
                        </select>
                        <button className="btn-primary sm" onClick={() => saveResult(game)} disabled={saving[game.id]}>
                          {saving[game.id] ? 'Saving…' : 'Save result'}
                        </button>
                      </div>
                    )
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
