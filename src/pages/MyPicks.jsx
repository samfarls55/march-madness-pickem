import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

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

function spreadForPick(game, pickedTeam) {
  const val = pickedTeam === game.home_team ? game.spread : -game.spread
  return val > 0 ? `+${val}` : `${val}`
}

export default function MyPicks() {
  const { session } = useAuth()
  const [games, setGames] = useState([])
  const [pickMap, setPickMap] = useState({})
  const [resultMap, setResultMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedRound, setSelectedRound] = useState(null)

  useEffect(() => { loadAll() }, [session])

  async function loadAll() {
    const [{ data: g }, { data: p }, { data: r }] = await Promise.all([
      supabase.from('games').select('*').order('date').order('tip_off_time'),
      supabase.from('picks').select('*').eq('user_id', session.user.id),
      supabase.from('results').select('*'),
    ])

    const allGames = g || []
    setGames(allGames)

    const pm = {}
    for (const pick of p || []) pm[pick.game_id] = pick
    setPickMap(pm)

    const rm = {}
    for (const res of r || []) rm[res.game_id] = res
    setResultMap(rm)

    // Default: most recent round (closest to championship) with picks
    const roundsWithPicks = ROUND_ORDER.filter(r =>
      allGames.some(game => game.round === r && pm[game.id])
    )
    if (roundsWithPicks.length > 0) {
      setSelectedRound(roundsWithPicks[roundsWithPicks.length - 1])
    } else {
      const roundsWithGames = ROUND_ORDER.filter(r => allGames.some(game => game.round === r))
      if (roundsWithGames.length > 0) setSelectedRound(roundsWithGames[roundsWithGames.length - 1])
    }

    setLoading(false)
  }

  if (loading) return <div className="page-shell"><div className="spinner" /></div>

  // Build round map
  const byRound = {}
  for (const game of games) {
    if (!byRound[game.round]) byRound[game.round] = []
    byRound[game.round].push(game)
  }
  const availableRounds = ROUND_ORDER.filter(r => byRound[r])

  // ── Personal analytics ──
  const gameMap = {}
  for (const g of games) gameMap[g.id] = g

  const gradedPicks = Object.values(pickMap).filter(p => p.is_correct !== null && p.is_correct !== undefined)
  const totalCorrect = gradedPicks.filter(p => p.is_correct).length
  const totalPoints = Object.values(pickMap).reduce((sum, p) => sum + (p.points_awarded || 0), 0)
  const overallAccuracy = gradedPicks.length > 0 ? Math.round(totalCorrect / gradedPicks.length * 100) : null

  let chalkCorrect = 0, chalkTotal = 0, dogCorrect = 0, dogTotal = 0
  for (const p of gradedPicks) {
    const g = gameMap[p.game_id]
    if (!g) continue
    const pickedFav = (p.picked_team === g.home_team && g.spread < 0) ||
                      (p.picked_team === g.away_team && g.spread > 0)
    if (pickedFav) { chalkTotal++; if (p.is_correct) chalkCorrect++ }
    else            { dogTotal++;   if (p.is_correct) dogCorrect++ }
  }
  const chalkAccuracy = chalkTotal > 0 ? Math.round(chalkCorrect / chalkTotal * 100) : null
  const dogAccuracy   = dogTotal   > 0 ? Math.round(dogCorrect   / dogTotal   * 100) : null

  const roundGames = selectedRound ? (byRound[selectedRound] || []) : []

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">My picks</h1>
          <p className="page-subtitle">{totalPoints} pts · {totalCorrect} correct</p>
        </div>
      </div>

      {games.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">🏀</div>
          <p>No games yet.</p>
          <p className="muted">Check back when games are scheduled.</p>
        </div>
      )}

      {/* ── Personal analytics strip ── */}
      {overallAccuracy !== null && (
        <>
          <h2 className="an-section-title">My performance</h2>
          <div className="an-stat-strip">
            <div className="an-stat-cell">
              <span className="an-stat-label">Overall</span>
              <span className="an-stat-value">{overallAccuracy}%</span>
              <span className="an-stat-sub">{totalCorrect}/{gradedPicks.length}</span>
            </div>
            {chalkAccuracy !== null && (
              <div className="an-stat-cell">
                <span className="an-stat-label">Chalk</span>
                <span className="an-stat-value">{chalkAccuracy}%</span>
                <span className="an-stat-sub">{chalkCorrect}/{chalkTotal}</span>
              </div>
            )}
            {dogAccuracy !== null && (
              <div className="an-stat-cell">
                <span className="an-stat-label">Dogs</span>
                <span className="an-stat-value">{dogAccuracy}%</span>
                <span className="an-stat-sub">{dogCorrect}/{dogTotal}</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Round selector ── */}
      {availableRounds.length > 0 && (
        <div className="mp-round-select-wrap">
          <select
            className="mp-round-select"
            value={selectedRound || ''}
            onChange={e => setSelectedRound(e.target.value)}
          >
            {[...availableRounds].reverse().map(r => (
              <option key={r} value={r}>{ROUND_LABELS[r]}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Picks table for selected round ── */}
      {roundGames.length > 0 && (
        <div className="lb-table-wrap">
          <table className="lb-table mp-table">
            <thead>
              <tr>
                <th className="lb-th name">Matchup</th>
                <th className="lb-th name">Date</th>
                <th className="lb-th name">My pick</th>
                <th className="lb-th name">Result</th>
                <th className="lb-th num">Pts</th>
              </tr>
            </thead>
            <tbody>
              {roundGames.map(game => {
                const pick = pickMap[game.id]
                const result = resultMap[game.id]

                let outcomeEl = <span className="muted">Pending</span>
                if (result) {
                  const score = `${result.away_score}–${result.home_score} · ATS: ${result.winning_team_vs_spread}`
                  if (!pick) {
                    outcomeEl = <span><span className="mp-outcome mp-none">No pick</span>{' '}<span className="mp-score">{score}</span></span>
                  } else if (pick.is_correct) {
                    outcomeEl = <span><span className="mp-outcome mp-correct">Correct</span>{' '}<span className="mp-score">{score}</span></span>
                  } else {
                    outcomeEl = <span><span className="mp-outcome mp-wrong">Wrong</span>{' '}<span className="mp-score">{score}</span></span>
                  }
                }

                return (
                  <tr key={game.id} className="lb-row">
                    <td className="lb-td name">
                      {game.away_team} <span className="muted">vs</span> {game.home_team}
                    </td>
                    <td className="lb-td name mp-date">{game.date}</td>
                    <td className="lb-td name">
                      {pick ? (
                        <>{pick.picked_team}<span className="mp-spread">{spreadForPick(game, pick.picked_team)}</span></>
                      ) : <span className="muted">—</span>}
                    </td>
                    <td className="lb-td name">{outcomeEl}</td>
                    <td className="lb-td num">
                      {pick?.points_awarded != null ? pick.points_awarded : <span className="muted">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
