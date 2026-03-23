import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const ROUND_LABELS = {
  first_four:    'First Four',
  round_of_64:   'Round of 64',
  round_of_32:   'Round of 32',
  sweet_sixteen: 'Sweet Sixteen',
  elite_eight:   'Elite Eight',
  final_four:    'Final Four',
  championship:  'Championship',
}

const ROUND_ORDER = [
  'first_four', 'round_of_64', 'round_of_32',
  'sweet_sixteen', 'elite_eight', 'final_four', 'championship',
]

export default function Analytics() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  useEffect(() => {
    async function load() {
      const [{ data: picks }, { data: games }, { data: users }] = await Promise.all([
        supabase.from('picks').select('user_id, game_id, picked_team, is_correct'),
        supabase.from('games').select('id, date, round, home_team, away_team, spread, tip_off_time'),
        supabase.from('users').select('id, name'),
      ])

      const gameMap = {}
      for (const g of games || []) gameMap[g.id] = g
      const userMap = {}
      for (const u of users || []) userMap[u.id] = u.name

      const allGraded = (picks || []).filter(p => p.is_correct !== null && p.is_correct !== undefined)

      // ── Group totals ──────────────────────────────────────────
      const totalPicks   = allGraded.length
      const totalCorrect = allGraded.filter(p => p.is_correct).length
      const groupAccuracy = totalPicks > 0 ? Math.round(totalCorrect / totalPicks * 100) : 0

      // ── Last 10 graded games (by tip_off_time) ────────────────
      const gradedGameIds = [...new Set(allGraded.map(p => p.game_id))]
        .filter(id => gameMap[id])
        .sort((a, b) =>
          `${gameMap[a].date}T${gameMap[a].tip_off_time}`
            .localeCompare(`${gameMap[b].date}T${gameMap[b].tip_off_time}`)
        )
      const last10GameIds = gradedGameIds.slice(-10)

      // Pick lookup: { [userId]: { [gameId]: true|false } }
      const pickLookup = {}
      for (const p of picks || []) {
        if (!pickLookup[p.user_id]) pickLookup[p.user_id] = {}
        pickLookup[p.user_id][p.game_id] = p.is_correct
      }

      // Per-user form — missed picks = loss (grey dot)
      const playerForm = (users || [])
        .map(u => {
          const uPicks = pickLookup[u.id] || {}
          const dots = last10GameIds.map(gid => {
            if (!(gid in uPicks)) return 'missed'
            return uPicks[gid] ? 'correct' : 'wrong'
          })
          const correct = dots.filter(d => d === 'correct').length
          return {
            userId: u.id,
            name: u.name,
            dots,
            correct,
            total: last10GameIds.length,
            accuracy: last10GameIds.length > 0 ? Math.round(correct / last10GameIds.length * 100) : 0,
          }
        })
        .filter(p => p.total > 0)
        .sort((a, b) => b.accuracy - a.accuracy || b.correct - a.correct)

      const top5    = playerForm.slice(0, 5)
      const topIds  = new Set(top5.map(p => p.userId))
      const bottom5 = [...playerForm].reverse().filter(p => !topIds.has(p.userId)).slice(0, 5)

      // ── Round accuracy ────────────────────────────────────────
      const roundStats = {}
      for (const r of ROUND_ORDER) {
        const rp = allGraded.filter(p => gameMap[p.game_id]?.round === r)
        if (rp.length > 0) {
          const correct = rp.filter(p => p.is_correct).length
          roundStats[r] = { total: rp.length, correct, accuracy: Math.round(correct / rp.length * 100) }
        }
      }

      // ── Spread tendency ───────────────────────────────────────
      let favPicks = 0, favCorrect = 0, dogPicks = 0, dogCorrect = 0
      for (const p of allGraded) {
        const g = gameMap[p.game_id]
        if (!g) continue
        const pickedFav = (p.picked_team === g.home_team && g.spread < 0) ||
                          (p.picked_team === g.away_team && g.spread > 0)
        if (pickedFav) { favPicks++; if (p.is_correct) favCorrect++ }
        else            { dogPicks++; if (p.is_correct) dogCorrect++ }
      }

      const uniquePlayers = new Set(allGraded.map(p => p.user_id)).size

      setData({ groupAccuracy, totalPicks, totalCorrect, uniquePlayers, top5, bottom5, last10Count: last10GameIds.length, roundStats, favPicks, favCorrect, dogPicks, dogCorrect })
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="page-shell"><div className="spinner" /></div>
  if (!data)   return null

  const { groupAccuracy, totalPicks, totalCorrect, uniquePlayers, top5, bottom5, last10Count, roundStats, favPicks, favCorrect, dogPicks, dogCorrect } = data
  const favAccuracy = favPicks > 0 ? Math.round(favCorrect / favPicks * 100) : null
  const dogAccuracy = dogPicks > 0 ? Math.round(dogCorrect / dogPicks * 100) : null

  function FormRow({ player, hot }) {
    return (
      <div className="an-hot-row">
        <span className="an-hot-name">{player.name}</span>
        <div className="an-form-dots">
          {player.dots.map((d, i) => (
            <span key={i} className={`an-dot ${d}`} title={d === 'missed' ? 'No pick submitted' : d === 'correct' ? 'Correct' : 'Wrong'} />
          ))}
        </div>
        <div className="an-hot-bar-wrap">
          <div className={`an-hot-bar ${hot ? 'hot' : 'cold'}`} style={{ width: `${player.accuracy}%` }} />
        </div>
        <span className="an-hot-pct">{player.accuracy}%</span>
        <span className="an-hot-sub muted">{player.correct}/{player.total}</span>
      </div>
    )
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">{totalPicks} picks graded across {uniquePlayers} players</p>
        </div>
      </div>

      {/* ── Pulse cards ── */}
      <div className="an-cards">
        <div className="an-card">
          <span className="an-card-label">Group accuracy</span>
          <span className="an-card-value">{groupAccuracy}%</span>
          <span className="an-card-sub">{totalCorrect} of {totalPicks} correct</span>
        </div>
        {favAccuracy !== null && (
          <div className="an-card">
            <span className="an-card-label">Chalk picks</span>
            <span className="an-card-value">{favAccuracy}%</span>
            <span className="an-card-descriptor">accuracy on favorites</span>
            <span className="an-card-sub">{favCorrect} of {favPicks} correct</span>
            <span className="an-card-sub">{Math.round(favPicks / (favPicks + dogPicks) * 100)}% of all picks taken on chalk</span>
          </div>
        )}
        {dogAccuracy !== null && (
          <div className="an-card">
            <span className="an-card-label">Dog picks</span>
            <span className="an-card-value">{dogAccuracy}%</span>
            <span className="an-card-descriptor">accuracy on underdogs</span>
            <span className="an-card-sub">{dogCorrect} of {dogPicks} correct</span>
            <span className="an-card-sub">{Math.round(dogPicks / (favPicks + dogPicks) * 100)}% of all picks taken on dogs</span>
          </div>
        )}
      </div>

      {/* ── Hot / Cold pickers ── */}
      {last10Count > 0 && (
        <section className="an-section">
          <h2 className="an-section-title">
            Form — last {last10Count} game{last10Count !== 1 ? 's' : ''}
            <span className="an-section-meta">missed picks count as a loss</span>
          </h2>

          {top5.length > 0 && (
            <>
              <p className="an-subsection-label">🔥 Top 5</p>
              <div className="an-hot-list">
                {top5.map(p => <FormRow key={p.userId} player={p} hot={true} />)}
              </div>
            </>
          )}

          {bottom5.length > 0 && (
            <>
              <p className="an-subsection-label" style={{ marginTop: '1rem' }}>🧊 Bottom 5</p>
              <div className="an-hot-list">
                {bottom5.map(p => <FormRow key={p.userId} player={p} hot={false} />)}
              </div>
            </>
          )}
        </section>
      )}

      {/* ── Round accuracy ── */}
      {Object.keys(roundStats).length > 0 && (
        <section className="an-section">
          <h2 className="an-section-title">Accuracy by round</h2>
          <div className="an-rounds">
            {ROUND_ORDER.filter(r => roundStats[r]).map(r => {
              const s = roundStats[r]
              return (
                <div key={r} className="an-round-row">
                  <span className="an-round-label">{ROUND_LABELS[r]}</span>
                  <div className="an-bar-wrap">
                    <div className="an-bar" style={{ width: `${s.accuracy}%` }} />
                  </div>
                  <span className="an-round-pct">{s.accuracy}%</span>
                  <span className="an-round-sub muted">{s.correct}/{s.total}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

    </div>
  )
}
