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

export default function MyPicks() {
  const { session } = useAuth()
  const [games, setGames] = useState([])
  const [pickMap, setPickMap] = useState({})
  const [resultMap, setResultMap] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAll() }, [session])

  async function loadAll() {
    const [{ data: g }, { data: p }, { data: r }] = await Promise.all([
      supabase.from('games').select('*').order('date').order('tip_off_time'),
      supabase.from('picks').select('*').eq('user_id', session.user.id),
      supabase.from('results').select('*'),
    ])

    setGames(g || [])

    const pm = {}
    for (const pick of p || []) pm[pick.game_id] = pick
    setPickMap(pm)

    const rm = {}
    for (const res of r || []) rm[res.game_id] = res
    setResultMap(rm)

    setLoading(false)
  }

  if (loading) return <div className="page-shell"><div className="spinner" /></div>

  const byRound = {}
  for (const game of games) {
    if (!byRound[game.round]) byRound[game.round] = []
    byRound[game.round].push(game)
  }

  const totalCorrect = Object.values(pickMap).filter(p => p.is_correct).length
  const totalPoints = Object.values(pickMap).reduce((sum, p) => sum + (p.points_awarded || 0), 0)

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">My picks</h1>
          <p className="page-subtitle">{totalCorrect} correct · {totalPoints} pts</p>
        </div>
      </div>

      {games.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">🏀</div>
          <p>No games yet.</p>
          <p className="muted">Check back when games are scheduled.</p>
        </div>
      )}

      {ROUND_ORDER.filter(r => byRound[r]).map(round => (
        <section key={round} className="admin-section">
          <h2 className="admin-section-title">{ROUND_LABELS[round]}</h2>
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
                {byRound[round].map(game => {
                  const pick = pickMap[game.id]
                  const result = resultMap[game.id]

                  let outcomeEl = <span className="muted">Pending</span>
                  if (result) {
                    const score = `${result.away_score}–${result.home_score} · ATS: ${result.winning_team_vs_spread}`
                    if (!pick) {
                      outcomeEl = (
                        <span>
                          <span className="mp-outcome mp-none">No pick</span>
                          {' '}
                          <span className="mp-score">{score}</span>
                        </span>
                      )
                    } else if (pick.is_correct) {
                      outcomeEl = (
                        <span>
                          <span className="mp-outcome mp-correct">Correct</span>
                          {' '}
                          <span className="mp-score">{score}</span>
                        </span>
                      )
                    } else {
                      outcomeEl = (
                        <span>
                          <span className="mp-outcome mp-wrong">Wrong</span>
                          {' '}
                          <span className="mp-score">{score}</span>
                        </span>
                      )
                    }
                  }

                  return (
                    <tr key={game.id} className="lb-row">
                      <td className="lb-td name">
                        {game.away_team} <span className="muted">vs</span> {game.home_team}
                      </td>
                      <td className="lb-td name mp-date">{game.date}</td>
                      <td className="lb-td name">
                        {pick ? pick.picked_team : <span className="muted">—</span>}
                      </td>
                      <td className="lb-td name">{outcomeEl}</td>
                      <td className="lb-td num">
                        {pick?.points_awarded != null
                          ? pick.points_awarded
                          : <span className="muted">—</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}
