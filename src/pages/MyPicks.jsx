import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { ROUND_LABELS, ROUND_ORDER } from '../lib/constants'

function spreadForPick(game, pickedTeam) {
  const val = pickedTeam === game.home_team ? game.spread : -game.spread
  return val > 0 ? `+${val}` : `${val}`
}

export default function MyPicks() {
  const { session } = useAuth()
  const [games, setGames]         = useState([])
  const [pickMap, setPickMap]     = useState({})
  const [resultMap, setResultMap] = useState({})
  const [loading, setLoading]     = useState(true)
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

  const byRound = {}
  for (const game of games) {
    if (!byRound[game.round]) byRound[game.round] = []
    byRound[game.round].push(game)
  }
  const availableRounds = ROUND_ORDER.filter(r => byRound[r])

  const totalCorrect = Object.values(pickMap).filter(p => p.is_correct).length
  const totalPoints  = Object.values(pickMap).reduce((sum, p) => sum + (p.points_awarded || 0), 0)

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
                const pick   = pickMap[game.id]
                const result = resultMap[game.id]
                let outcomeEl = <span className="muted">Pending</span>
                if (result) {
                  const score = `${result.away_score}–${result.home_score} · ATS: ${result.winning_team_vs_spread}`
                  if (!pick)                outcomeEl = <span><span className="mp-outcome mp-none">No pick</span>{' '}<span className="mp-score">{score}</span></span>
                  else if (pick.is_correct) outcomeEl = <span><span className="mp-outcome mp-correct">Correct</span>{' '}<span className="mp-score">{score}</span></span>
                  else                      outcomeEl = <span><span className="mp-outcome mp-wrong">Wrong</span>{' '}<span className="mp-score">{score}</span></span>
                }
                return (
                  <tr key={game.id} className="lb-row">
                    <td className="lb-td name">{game.away_team} <span className="muted">vs</span> {game.home_team}</td>
                    <td className="lb-td name mp-date">{game.date}</td>
                    <td className="lb-td name">
                      {pick
                        ? <>{pick.picked_team}<span className="mp-spread">{spreadForPick(game, pick.picked_team)}</span></>
                        : <span className="muted">—</span>}
                    </td>
                    <td className="lb-td name">{outcomeEl}</td>
                    <td className="lb-td num">{pick?.points_awarded != null ? pick.points_awarded : <span className="muted">—</span>}</td>
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
