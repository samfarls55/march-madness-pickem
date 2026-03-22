import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// Returns null if streak < 3, else { correct: bool, count: number }
function computeStreak(settledPicks) {
  if (!settledPicks.length) return null
  const last = settledPicks[settledPicks.length - 1].correct
  let count = 0
  for (let i = settledPicks.length - 1; i >= 0; i--) {
    if (settledPicks[i].correct === last) count++
    else break
  }
  return count >= 3 ? { correct: last, count } : null
}

export default function Leaderboard() {
  const { session } = useAuth()
  const [rows, setRows] = useState([])
  const [streakMap, setStreakMap] = useState({})
  const [eligibilityMap, setEligibilityMap] = useState({}) // { [userId]: bool }
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: lb }, { data: picks }, { data: games }] = await Promise.all([
        supabase.from('leaderboard').select('*'),
        supabase.from('picks').select('user_id, game_id, is_correct'),
        supabase.from('games').select('id, date, tip_off_time'),
      ])

      setRows(lb || [])

      // Build lookup maps
      const gameMap = {}
      for (const g of games || []) gameMap[g.id] = g

      // Group picks by user, keep only graded picks, sort by date+time
      const byUser = {}
      for (const p of picks || []) {
        if (p.is_correct === null || p.is_correct === undefined) continue // ungraded
        const g = gameMap[p.game_id]
        if (!g) continue
        if (!byUser[p.user_id]) byUser[p.user_id] = []
        byUser[p.user_id].push({
          ts: `${g.date}T${g.tip_off_time}`,
          correct: p.is_correct,
        })
      }

      const sm = {}
      for (const [uid, userPicks] of Object.entries(byUser)) {
        userPicks.sort((a, b) => a.ts.localeCompare(b.ts))
        sm[uid] = computeStreak(userPicks)
      }
      setStreakMap(sm)

      // Eligibility: must have picked every game in the tournament
      const totalGames = (games || []).length
      const pickCountByUser = {}
      for (const p of picks || []) {
        pickCountByUser[p.user_id] = (pickCountByUser[p.user_id] || 0) + 1
      }
      const em = {}
      for (const row of lb || []) {
        em[row.user_id] = (pickCountByUser[row.user_id] || 0) === totalGames
      }
      setEligibilityMap(em)

      setLoading(false)
    }
    load()
  }, [])

  // Last eligible player by rank (walks from the bottom up)
  const eligibleLastId = (() => {
    for (let i = rows.length - 1; i >= 0; i--) {
      if (eligibilityMap[rows[i].user_id]) return rows[i].user_id
    }
    return null
  })()

  // Returns 'prize' | 'burn' | null — at most one per player
  function getMoneyIcon(row, i) {
    if (i === 0) return 'prize'                            // 1st
    if (i === 1) return 'prize'                            // 2nd
    if (row.user_id === eligibleLastId) return 'prize'     // eligible last place
    if (i === 5 && rows.length >= 6) return 'burn'         // 6th (≥6 players only)
    return null
  }


  if (loading) return <div className="page-shell"><div className="spinner" /></div>

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">Leaderboard</h1>
          <p className="page-subtitle">{rows.length} players</p>
        </div>
      </div>

      <div className="lb-table-wrap">
        <table className="lb-table">
          <thead>
            <tr>
              <th className="lb-th rank">#</th>
              <th className="lb-th name">Player</th>
              <th className="lb-th num">Pts</th>
              <th className="lb-th num">FF4</th>
              <th className="lb-th num">R64</th>
              <th className="lb-th num">R32</th>
              <th className="lb-th num">S16</th>
              <th className="lb-th num">E8</th>
              <th className="lb-th num">FF</th>
              <th className="lb-th num">🏆</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isMe = row.user_id === session?.user?.id
              const streak = streakMap[row.user_id] ?? null
              const moneyIcon = getMoneyIcon(row, i)

              const moneyTitle = moneyIcon === 'burn'
                ? 'Going down the drain 🚽'
                : i === 0 ? '1st place 💵'
                : i === 1 ? '2nd place 💵'
                : 'Last place 💵'

              return (
                <tr
                  key={row.user_id}
                  className={`lb-row ${isMe ? 'lb-row-me' : ''}`}
                >
                  <td className="lb-td rank">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </td>
                  <td className="lb-td name">
                    <span className="lb-name">{row.name}</span>
                    {moneyIcon && (
                      <span
                        className={`lb-money ${moneyIcon === 'burn' ? 'lb-money-burn' : 'lb-money-prize'}`}
                        title={moneyTitle}
                      >
                        {moneyIcon === 'burn' ? '🚽' : '💵'}
                      </span>
                    )}
                    {streak && (
                      <span
                        className={`lb-streak ${streak.correct ? 'lb-streak-hot' : 'lb-streak-cold'}`}
                        title={streak.correct ? `${streak.count}-pick win streak` : `${streak.count}-pick loss streak`}
                      >
                        {streak.correct ? '🔥' : '🤡'}{streak.count}
                      </span>
                    )}
                    {isMe && <span className="lb-you">you</span>}
                  </td>
                  <td className="lb-td num pts">{row.total_points ?? 0}</td>
                  <td className="lb-td num">{row.correct_ff4 ?? 0}</td>
                  <td className="lb-td num">{row.correct_r64 ?? 0}</td>
                  <td className="lb-td num">{row.correct_r32 ?? 0}</td>
                  <td className="lb-td num">{row.correct_s16 ?? 0}</td>
                  <td className="lb-td num">{row.correct_e8 ?? 0}</td>
                  <td className="lb-td num">{row.correct_ff ?? 0}</td>
                  <td className="lb-td num">{row.correct_champ ?? 0}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="lb-footnote">
        Scoring: First Four/R64/R32 = 1pt · Sweet 16 = 2pts · Elite 8 = 3pts · Final Four = 4pts · Championship = 5pts
      </p>
    </div>
  )
}
