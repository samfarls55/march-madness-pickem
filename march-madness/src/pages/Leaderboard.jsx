import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function Leaderboard() {
  const { session } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('leaderboard')
      .select('*')
      .then(({ data }) => {
        setRows(data || [])
        setLoading(false)
      })
  }, [])

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
              const isLastPlace = !row.is_eligible_for_last_place

              return (
                <tr
                  key={row.user_id}
                  className={`lb-row ${isMe ? 'lb-row-me' : ''} ${isLastPlace ? 'lb-row-ineligible' : ''}`}
                >
                  <td className="lb-td rank">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </td>
                  <td className="lb-td name">
                    <span className="lb-name">{row.name}</span>
                    {isMe && <span className="lb-you">you</span>}
                    {isLastPlace && <span className="lb-ineligible">ineligible</span>}
                  </td>
                  <td className="lb-td num pts">{row.total_points ?? 0}</td>
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
        Scoring: R64/R32/First Four = 1pt · Sweet 16 = 2pts · Elite 8 = 3pts · Final Four = 4pts · Championship = 5pts
      </p>
    </div>
  )
}
