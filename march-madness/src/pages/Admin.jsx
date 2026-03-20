import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const today = new Date().toISOString().split('T')[0]

export default function Admin() {
  const [games, setGames] = useState([])
  const [users, setUsers] = useState([])
  const [picks, setPicks] = useState([])
  const [results, setResults] = useState({}) // { [game_id]: result row }
  const [overrides, setOverrides] = useState({}) // { [game_id]: { home_score, away_score, winner } }
  const [saving, setSaving] = useState({})
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    const [{ data: g }, { data: u }, { data: p }, { data: r }] = await Promise.all([
      supabase.from('games').select('*').eq('date', today).order('tip_off_time'),
      supabase.from('users').select('*').order('name'),
      supabase.from('picks').select('*, games(date)').eq('games.date', today),
      supabase.from('results').select('*, games(date)').eq('games.date', today),
    ])
    setGames(g || [])
    setUsers(u || [])
    setPicks(p || [])
    const rMap = {}
    for (const row of r || []) rMap[row.game_id] = row
    setResults(rMap)
    setLoading(false)
  }

  async function toggleLock(game) {
    await supabase.from('games').update({ is_locked: !game.is_locked }).eq('id', game.id)
    setGames(prev => prev.map(g => g.id === game.id ? { ...g, is_locked: !g.is_locked } : g))
  }

  function updateOverride(gameId, field, value) {
    setOverrides(prev => ({
      ...prev,
      [gameId]: { ...prev[gameId], [field]: value },
    }))
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

    // Score all picks for this game
    const gamePicks = picks.filter(p => p.game_id === game.id)
    const scored = gamePicks.map(p => ({
      id: p.id,
      is_correct: p.picked_team === o.winner,
      points_awarded: p.picked_team === o.winner ? pointsForRound(game.round) : 0,
    }))

    for (const sp of scored) {
      await supabase.from('picks').update({
        is_correct: sp.is_correct,
        points_awarded: sp.points_awarded,
      }).eq('id', sp.id)
    }

    setSaving(prev => ({ ...prev, [game.id]: false }))
    await loadAll()
  }

  function pointsForRound(round) {
    const map = { first_four: 1, round_of_64: 1, round_of_32: 1, sweet_sixteen: 2, elite_eight: 3, final_four: 4, championship: 5 }
    return map[round] ?? 0
  }

  // Submission matrix: which users submitted which games
  const submittedSet = new Set(picks.map(p => `${p.user_id}:${p.game_id}`))

  if (loading) return <div className="page-shell"><div className="spinner" /></div>

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin</h1>
          <p className="page-subtitle">Today · {today}</p>
        </div>
      </div>

      {error && <div className="auth-message error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {/* ── Submission status matrix ─────────────────────────────── */}
      <section className="admin-section">
        <h2 className="admin-section-title">Submission status</h2>
        {games.length === 0 ? (
          <p className="muted">No games today.</p>
        ) : (
          <div className="admin-matrix-wrap">
            <table className="admin-matrix">
              <thead>
                <tr>
                  <th className="matrix-th">Player</th>
                  {games.map(g => (
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
                    {games.map(g => {
                      const submitted = submittedSet.has(`${u.id}:${g.id}`)
                      return (
                        <td key={g.id} className="matrix-td center">
                          <span className={`matrix-dot ${submitted ? 'green' : 'red'}`} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Games: lock/unlock + score override ──────────────────── */}
      <section className="admin-section">
        <h2 className="admin-section-title">Games &amp; scores</h2>
        <div className="admin-games">
          {games.map(game => {
            const res = results[game.id]
            const o = overrides[game.id] || {}

            return (
              <div key={game.id} className="admin-game-card">
                <div className="admin-game-header">
                  <span className="admin-game-matchup">
                    {game.away_team} <span className="muted">vs</span> {game.home_team}
                  </span>
                  <button
                    className={`lock-toggle ${game.is_locked ? 'locked' : 'open'}`}
                    onClick={() => toggleLock(game)}
                  >
                    {game.is_locked ? '🔒 Locked' : '🔓 Open'}
                  </button>
                </div>

                {res ? (
                  <div className="admin-result-display">
                    <span className="result-score">{res.away_score} – {res.home_score}</span>
                    <span className="result-winner">ATS winner: {res.winning_team_vs_spread}</span>
                    <span className="result-final">Finalized</span>
                  </div>
                ) : (
                  <div className="admin-override">
                    <input
                      className="field-input sm"
                      type="number"
                      placeholder="Away score"
                      value={o.away_score || ''}
                      onChange={e => updateOverride(game.id, 'away_score', e.target.value)}
                    />
                    <input
                      className="field-input sm"
                      type="number"
                      placeholder="Home score"
                      value={o.home_score || ''}
                      onChange={e => updateOverride(game.id, 'home_score', e.target.value)}
                    />
                    <select
                      className="field-input sm"
                      value={o.winner || ''}
                      onChange={e => updateOverride(game.id, 'winner', e.target.value)}
                    >
                      <option value="">ATS winner…</option>
                      <option value={game.away_team}>{game.away_team}</option>
                      <option value={game.home_team}>{game.home_team}</option>
                    </select>
                    <button
                      className="btn-primary sm"
                      onClick={() => saveResult(game)}
                      disabled={saving[game.id]}
                    >
                      {saving[game.id] ? 'Saving…' : 'Save result'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
