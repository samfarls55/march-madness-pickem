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

const RANK_MEDALS = ['🥇', '🥈', '🥉', '4', '5']

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

      // ── Hot pickers — games that tipped off in the last hour ──
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
      const recentGameIds = new Set(
        (games || [])
          .filter(g => new Date(g.tip_off_time) >= oneHourAgo)
          .map(g => g.id)
      )
      const recentGraded = allGraded.filter(p => recentGameIds.has(p.game_id))

      const recentByUser = {}
      for (const p of recentGraded) {
        if (!recentByUser[p.user_id]) recentByUser[p.user_id] = []
        recentByUser[p.user_id].push(p)
      }
      const hotPickers = Object.entries(recentByUser)
        .map(([uid, userPicks]) => {
          const correct = userPicks.filter(p => p.is_correct).length
          return {
            userId: uid,
            name: userMap[uid] || 'Unknown',
            total: userPicks.length,
            correct,
            accuracy: Math.round(correct / userPicks.length * 100),
          }
        })
        .sort((a, b) => b.accuracy - a.accuracy || b.correct - a.correct)
        .slice(0, 5)

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

      setData({ groupAccuracy, totalPicks, totalCorrect, uniquePlayers, hotPickers, recentGameIds, roundStats, favPicks, favCorrect, dogPicks, dogCorrect })
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="page-shell"><div className="spinner" /></div>
  if (!data)   return null

  const { groupAccuracy, totalPicks, totalCorrect, uniquePlayers, hotPickers, recentGameIds, roundStats, favPicks, favCorrect, dogPicks, dogCorrect } = data
  const favAccuracy = favPicks > 0 ? Math.round(favCorrect / favPicks * 100) : null
  const dogAccuracy = dogPicks > 0 ? Math.round(dogCorrect / dogPicks * 100) : null

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
      </div>

      {/* ── Hot pickers ── */}
      <section className="an-section">
        <h2 className="an-section-title">
          🔥 Hottest pickers — last hour
          {recentGameIds.size > 0 && <span className="an-section-meta">{recentGameIds.size} game{recentGameIds.size !== 1 ? 's' : ''}</span>}
        </h2>
        {hotPickers.length === 0 ? (
          <p className="muted" style={{ fontSize: '0.88rem' }}>No graded games in the last hour.</p>
        ) : (
          <div className="an-hot-list">
            {hotPickers.map((p, i) => (
              <div key={p.userId} className="an-hot-row">
                <span className="an-hot-rank">{RANK_MEDALS[i]}</span>
                <span className="an-hot-name">{p.name}</span>
                <div className="an-hot-bar-wrap">
                  <div className="an-hot-bar" style={{ width: `${p.accuracy}%` }} />
                </div>
                <span className="an-hot-pct">{p.accuracy}%</span>
                <span className="an-hot-sub muted">{p.correct}/{p.total}</span>
              </div>
            ))}
          </div>
        )}
      </section>

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

      {/* ── Spread tendency ── */}
      {(favPicks > 0 || dogPicks > 0) && (
        <section className="an-section">
          <h2 className="an-section-title">Favorites vs. underdogs</h2>
          <div className="an-cards">
            {favAccuracy !== null && (
              <div className="an-card">
                <span className="an-card-label">Chalk picks</span>
                <span className="an-card-value">{favAccuracy}%</span>
                <span className="an-card-sub">{favCorrect}/{favPicks} correct · {Math.round(favPicks / (favPicks + dogPicks) * 100)}% of picks</span>
              </div>
            )}
            {dogAccuracy !== null && (
              <div className="an-card">
                <span className="an-card-label">Dog picks</span>
                <span className="an-card-value">{dogAccuracy}%</span>
                <span className="an-card-sub">{dogCorrect}/{dogPicks} correct · {Math.round(dogPicks / (favPicks + dogPicks) * 100)}% of picks</span>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
