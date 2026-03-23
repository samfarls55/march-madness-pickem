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

      // ── Per-user stats ────────────────────────────────────────
      const byUser = {}
      for (const p of allGraded) {
        if (!byUser[p.user_id]) byUser[p.user_id] = []
        byUser[p.user_id].push(p)
      }
      for (const uid of Object.keys(byUser)) {
        byUser[uid].sort((a, b) => {
          const ga = gameMap[a.game_id], gb = gameMap[b.game_id]
          if (!ga || !gb) return 0
          return `${ga.date}T${ga.tip_off_time}`.localeCompare(`${gb.date}T${gb.tip_off_time}`)
        })
      }

      const playerStats = Object.entries(byUser).map(([uid, userPicks]) => {
        const correct  = userPicks.filter(p => p.is_correct).length
        const accuracy = Math.round(correct / userPicks.length * 100)
        const last5    = userPicks.slice(-5)
        const recent   = last5.length > 0 ? Math.round(last5.filter(p => p.is_correct).length / last5.length * 100) : null
        return { userId: uid, name: userMap[uid] || 'Unknown', total: userPicks.length, correct, accuracy, last5, recent }
      }).sort((a, b) => (b.recent ?? -1) - (a.recent ?? -1))

      const hottestPlayer = playerStats.filter(p => p.last5.length >= 3)[0] ?? null

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

      // ── Pick consensus (completed games) ─────────────────────
      const gamePickMap = {}
      for (const p of picks || []) {
        const g = gameMap[p.game_id]
        if (!g) continue
        if (!gamePickMap[g.id]) gamePickMap[g.id] = { game: g, home: 0, away: 0 }
        if (p.picked_team === g.home_team) gamePickMap[g.id].home++
        else gamePickMap[g.id].away++
      }

      const consensus = Object.values(gamePickMap)
        .filter(({ game }) => {
          // only games that are fully graded (any pick for this game has is_correct set)
          return allGraded.some(p => p.game_id === game.id)
        })
        .map(({ game, home, away }) => {
          const total    = home + away
          const homePct  = total > 0 ? Math.round(home / total * 100) : 50
          const awayPct  = 100 - homePct
          // Determine winner from graded picks (correct pick = winner)
          const winnerPick = allGraded.find(p => p.game_id === game.id && p.is_correct)
          const winner   = winnerPick?.picked_team ?? null
          const majority = homePct >= 50 ? game.home_team : game.away_team
          return { game, home: { count: home, pct: homePct }, away: { count: away, pct: awayPct }, winner, crowdRight: winner ? majority === winner : null, total }
        })
        .filter(c => c.winner)
        .sort((a, b) => `${b.game.date}T${b.game.tip_off_time}`.localeCompare(`${a.game.date}T${a.game.tip_off_time}`))

      const crowdCorrectRate = consensus.length > 0
        ? Math.round(consensus.filter(c => c.crowdRight).length / consensus.length * 100)
        : null

      setData({ groupAccuracy, totalPicks, totalCorrect, hottestPlayer, playerStats, roundStats, favPicks, favCorrect, dogPicks, dogCorrect, consensus, crowdCorrectRate })
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="page-shell"><div className="spinner" /></div>
  if (!data)   return null

  const { groupAccuracy, totalPicks, totalCorrect, hottestPlayer, playerStats, roundStats, favPicks, favCorrect, dogPicks, dogCorrect, consensus, crowdCorrectRate } = data
  const favAccuracy = favPicks > 0 ? Math.round(favCorrect / favPicks * 100) : null
  const dogAccuracy = dogPicks > 0 ? Math.round(dogCorrect / dogPicks * 100) : null

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">{totalPicks} picks graded across {playerStats.length} players</p>
        </div>
      </div>

      {/* ── Pulse cards ── */}
      <div className="an-cards">
        <div className="an-card">
          <span className="an-card-label">Group accuracy</span>
          <span className="an-card-value">{groupAccuracy}%</span>
          <span className="an-card-sub">{totalCorrect} of {totalPicks} correct</span>
        </div>
        {crowdCorrectRate !== null && (
          <div className="an-card">
            <span className="an-card-label">Crowd picks</span>
            <span className="an-card-value">{crowdCorrectRate}%</span>
            <span className="an-card-sub">majority won</span>
          </div>
        )}
        {hottestPlayer && (
          <div className="an-card">
            <span className="an-card-label">Hottest player</span>
            <span className="an-card-value">{hottestPlayer.name.split(' ')[0]}</span>
            <span className="an-card-sub">{hottestPlayer.recent}% last {hottestPlayer.last5.length}</span>
          </div>
        )}
      </div>

      {/* ── Player form ── */}
      <section className="an-section">
        <h2 className="an-section-title">Player form — last 5 picks</h2>
        <div className="an-form-table">
          {playerStats.map(p => (
            <div key={p.userId} className="an-form-row">
              <span className="an-form-name">{p.name}</span>
              <div className="an-form-dots">
                {p.last5.map((pick, i) => (
                  <span key={i} className={`an-dot ${pick.is_correct ? 'correct' : 'wrong'}`} title={pick.is_correct ? 'Correct' : 'Wrong'} />
                ))}
                {Array.from({ length: 5 - p.last5.length }).map((_, i) => (
                  <span key={`e${i}`} className="an-dot empty" />
                ))}
              </div>
              <span className="an-form-pct">{p.recent !== null ? `${p.recent}%` : '—'}</span>
              <span className="an-form-overall muted">{p.accuracy}% overall</span>
            </div>
          ))}
        </div>
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

      {/* ── Pick consensus ── */}
      {consensus.length > 0 && (
        <section className="an-section">
          <h2 className="an-section-title">Pick consensus</h2>
          <div className="an-consensus">
            {consensus.map(({ game, home, away, winner, crowdRight }) => (
              <div key={game.id} className="an-consensus-card">
                <div className="an-consensus-header">
                  <span className="an-consensus-round">{ROUND_LABELS[game.round]}</span>
                  <span className={`an-verdict ${crowdRight ? 'right' : 'wrong'}`}>
                    {crowdRight ? 'Crowd right' : 'Crowd wrong'}
                  </span>
                </div>
                <div className="an-consensus-matchup">
                  <span className={away.team === winner ? 'an-winner' : ''}>{game.away_team}</span>
                  <span className="muted">vs</span>
                  <span className={home.team === winner ? 'an-winner' : ''}>{game.home_team}</span>
                </div>
                <div className="an-split-bar">
                  <div className="an-split-away" style={{ width: `${away.pct}%` }} />
                  <div className="an-split-home" style={{ width: `${home.pct}%` }} />
                </div>
                <div className="an-split-labels">
                  <span>{away.pct}%<span className="muted"> ({away.count})</span></span>
                  <span>{home.pct}%<span className="muted"> ({home.count})</span></span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
