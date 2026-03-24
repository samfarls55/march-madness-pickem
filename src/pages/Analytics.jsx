import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { ROUND_LABELS, ROUND_SHORT, ROUND_ORDER } from '../lib/constants'
import { ordinal, isFavorite } from '../lib/utils'

function RoundChart({ chartRounds, accuracyByRound, leagueAccuracyByRound }) {
  if (chartRounds.length === 0) return null
  const W = 500, H = 180
  const PAD = { top: 24, right: 20, bottom: 36, left: 8 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom
  const n = chartRounds.length
  const cx = i => PAD.left + (n === 1 ? chartW / 2 : i * (chartW / (n - 1)))
  const yOf = val => PAD.top + chartH - (val / 100) * chartH
  const accPath = n > 1 ? chartRounds.map((r, i) => `${i === 0 ? 'M' : 'L'}${cx(i)},${yOf(accuracyByRound[r] || 0)}`).join(' ') : null
  const leagueRounds = leagueAccuracyByRound ? chartRounds.filter(r => leagueAccuracyByRound[r] != null) : []
  const leaguePath = leagueRounds.length > 1
    ? leagueRounds.map((r, i) => `${i === 0 ? 'M' : 'L'}${cx(chartRounds.indexOf(r))},${yOf(leagueAccuracyByRound[r])}`).join(' ')
    : null

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {[0, 25, 50, 75, 100].map(pct => {
        const y = yOf(pct)
        return <line key={pct} x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="var(--border)" strokeWidth="0.75" strokeDasharray="4,4" />
      })}
      {leaguePath && <path d={leaguePath} fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="5,4" strokeLinejoin="round" opacity="0.6" />}
      {accPath    && <path d={accPath}    fill="none" stroke="var(--accent2)" strokeWidth="2" strokeLinejoin="round" />}
      {chartRounds.map((r, i) => {
        const ax = cx(i), ay = yOf(accuracyByRound[r] || 0)
        const acc = accuracyByRound[r] || 0
        const labelY = Math.max(ay - 10, PAD.top - 10)
        return (
          <g key={r}>
            <circle cx={ax} cy={ay} r={4} fill="var(--accent2)" />
            <text x={ax} y={labelY} textAnchor="middle" fontSize="10" fill="var(--accent2)" fontFamily="monospace">{acc}%</text>
            <text x={ax} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">{ROUND_SHORT[r]}</text>
          </g>
        )
      })}
      {/* Legend */}
      <line x1={PAD.left} y1={14} x2={PAD.left + 18} y2={14} stroke="var(--accent2)" strokeWidth="2" />
      <text x={PAD.left + 22} y={18} fontSize="9" fill="var(--accent2)">You</text>
      {leaguePath && <>
        <line x1={PAD.left + 48} y1={14} x2={PAD.left + 66} y2={14} stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="5,4" opacity="0.6" />
        <text x={PAD.left + 70} y={18} fontSize="9" fill="var(--muted)">Avg</text>
      </>}
    </svg>
  )
}

function DistBar({ chalkPicks, dogPicks }) {
  const total = chalkPicks + dogPicks
  if (total === 0) return null
  const chalkPct = Math.round(chalkPicks / total * 100)
  const dogPct = 100 - chalkPct
  return (
    <div className="an-dist-bar-wrap">
      <div className="an-dist-bar">
        <div className="an-dist-chalk" style={{ width: `${chalkPct}%` }} />
        <div className="an-dist-dog"   style={{ width: `${dogPct}%`   }} />
      </div>
      <div className="an-dist-labels">
        <span className="an-dist-label-left">
          <span className="an-dist-swatch chalk" />
          Chalk — {chalkPct}% <span className="muted">({chalkPicks})</span>
        </span>
        <span className="an-dist-label-right">
          <span className="an-dist-swatch dog" />
          Dogs — {dogPct}% <span className="muted">({dogPicks})</span>
        </span>
      </div>
    </div>
  )
}

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

export default function Analytics() {
  const { session } = useAuth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [view, setView] = useState('group')

  useEffect(() => {
    async function load() {
      const [{ data: picks }, { data: games }, { data: users }] = await Promise.all([
        supabase.from('picks').select('user_id, game_id, picked_team, is_correct, points_awarded'),
        supabase.from('games').select('id, date, round, home_team, away_team, spread, tip_off_time'),
        supabase.from('users').select('id, name'),
      ])

      const gameMap = {}
      for (const g of games || []) gameMap[g.id] = g

      const allGraded = (picks || []).filter(p => p.is_correct !== null && p.is_correct !== undefined)

      // ── Group totals ──────────────────────────────────────────
      const totalPicks   = allGraded.length
      const totalCorrect = allGraded.filter(p => p.is_correct).length
      const groupAccuracy = totalPicks > 0 ? Math.round(totalCorrect / totalPicks * 100) : 0

      // ── Last 10 graded games ──────────────────────────────────
      const gradedGameIds = [...new Set(allGraded.map(p => p.game_id))]
        .filter(id => gameMap[id])
        .sort((a, b) =>
          `${gameMap[a].date}T${gameMap[a].tip_off_time}`
            .localeCompare(`${gameMap[b].date}T${gameMap[b].tip_off_time}`)
        )
      const last10GameIds = gradedGameIds.slice(-10)

      const pickLookup = {}
      for (const p of picks || []) {
        if (!pickLookup[p.user_id]) pickLookup[p.user_id] = {}
        pickLookup[p.user_id][p.game_id] = p.is_correct
      }

      const playerForm = (users || [])
        .map(u => {
          const uPicks = pickLookup[u.id] || {}
          const dots = last10GameIds.map(gid => {
            if (!(gid in uPicks)) return 'missed'
            return uPicks[gid] ? 'correct' : 'wrong'
          })
          const correct = dots.filter(d => d === 'correct').length
          return { userId: u.id, name: u.name, dots, correct, total: last10GameIds.length,
            accuracy: last10GameIds.length > 0 ? Math.round(correct / last10GameIds.length * 100) : 0 }
        })
        .filter(p => p.total > 0)
        .sort((a, b) => b.accuracy - a.accuracy || b.correct - a.correct)

      const top5   = playerForm.slice(0, 5)
      const topIds = new Set(top5.map(p => p.userId))
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

      // ── Group spread tendency ─────────────────────────────────
      let favPicks = 0, favCorrect = 0, dogPicks = 0, dogCorrect = 0
      for (const p of allGraded) {
        const g = gameMap[p.game_id]
        if (!g) continue
        if (isFavorite(p, g)) { favPicks++; if (p.is_correct) favCorrect++ }
        else                  { dogPicks++; if (p.is_correct) dogCorrect++ }
      }

      const uniquePlayers = new Set(allGraded.map(p => p.user_id)).size

      setData({
        // group
        groupAccuracy, totalPicks, totalCorrect, uniquePlayers,
        top5, bottom5, last10Count: last10GameIds.length,
        roundStats, favPicks, favCorrect, dogPicks, dogCorrect,
        // raw (for personal view)
        allPicks: picks || [],
        games: games || [],
        gameMap,
      })
      setLoading(false)
    }
    load()
  }, [])

  // ── Personal analytics (memoized — rank history is O(rounds × picks)) ──
  const myId = session?.user?.id
  const personal = useMemo(() => {
    if (!data) return null
    const { allPicks, gameMap } = data
    const myPicks   = allPicks.filter(p => p.user_id === myId)
    const myGraded  = myPicks.filter(p => p.is_correct !== null && p.is_correct !== undefined)
    const myCorrect = myGraded.filter(p => p.is_correct).length
    const myPoints  = myPicks.reduce((s, p) => s + (p.points_awarded || 0), 0)
    const myOverall = myGraded.length > 0 ? Math.round(myCorrect / myGraded.length * 100) : null

    let myChalk = 0, myDogs = 0
    for (const p of myPicks) {
      const g = gameMap[p.game_id]
      if (!g) continue
      if (isFavorite(p, g)) myChalk++; else myDogs++
    }

    const myChartRounds = ROUND_ORDER.filter(r =>
      myGraded.some(p => gameMap[p.game_id]?.round === r)
    )
    const myAccuracyByRound = {}
    for (const r of myChartRounds) {
      const rp = myGraded.filter(p => gameMap[p.game_id]?.round === r)
      myAccuracyByRound[r] = Math.round(rp.filter(p => p.is_correct).length / rp.length * 100)
    }

    // Cumulative rank at end of each round
    const myRankHistory = {}
    for (let ri = 0; ri < ROUND_ORDER.length; ri++) {
      const round = ROUND_ORDER[ri]
      const roundSet = new Set(ROUND_ORDER.slice(0, ri + 1))
      const hasGraded = allPicks.some(pk =>
        pk.is_correct !== null && pk.is_correct !== undefined &&
        gameMap[pk.game_id]?.round === round
      )
      if (!hasGraded) continue
      const cumPoints = {}
      for (const pk of allPicks) {
        if (pk.is_correct === null || pk.is_correct === undefined) continue
        if (!roundSet.has(gameMap[pk.game_id]?.round)) continue
        cumPoints[pk.user_id] = (cumPoints[pk.user_id] || 0) + (pk.points_awarded || 0)
      }
      const myPts = cumPoints[myId] || 0
      myRankHistory[round] = Object.values(cumPoints).filter(pts => pts > myPts).length + 1
    }
    const rankRounds = ROUND_ORDER.filter(r => myRankHistory[r] !== undefined)

    return { myCorrect, myPoints, myOverall, myChalk, myDogs, myChartRounds, myAccuracyByRound, myRankHistory, rankRounds }
  }, [data, myId])

  if (loading) return <div className="page-shell"><div className="spinner" /></div>
  if (!data)   return null

  const { groupAccuracy, totalPicks, totalCorrect, uniquePlayers, top5, bottom5,
          last10Count, roundStats, favPicks, favCorrect, dogPicks, dogCorrect } = data

  const favAccuracy = favPicks > 0 ? Math.round(favCorrect / favPicks * 100) : null
  const dogAccuracy = dogPicks > 0 ? Math.round(dogCorrect / dogPicks * 100) : null

  const { myCorrect, myPoints, myOverall, myChalk, myDogs, myChartRounds, myAccuracyByRound, myRankHistory, rankRounds } = personal

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">
            {view === 'group'
              ? `${totalPicks} picks graded across ${uniquePlayers} players`
              : `${myPoints} pts · ${myCorrect} correct`}
          </p>
        </div>
      </div>

      {/* ── View toggle ── */}
      <div className="an-view-toggle">
        <button className={`an-view-btn ${view === 'group'    ? 'active' : ''}`} onClick={() => setView('group')}>Group</button>
        <button className={`an-view-btn ${view === 'personal' ? 'active' : ''}`} onClick={() => setView('personal')}>Personal</button>
      </div>

      {/* ════════════════════════════════════════════════════════
          GROUP VIEW
      ════════════════════════════════════════════════════════ */}
      {view === 'group' && (
        <>
          <h2 className="an-section-title">Accuracy</h2>
          <div className="an-stat-strip">
            <div className="an-stat-cell">
              <span className="an-stat-label">Overall</span>
              <span className="an-stat-value">{groupAccuracy}%</span>
              <span className="an-stat-sub">{totalCorrect}/{totalPicks}</span>
            </div>
            {favAccuracy !== null && (
              <div className="an-stat-cell">
                <span className="an-stat-label">Chalk</span>
                <span className="an-stat-value">{favAccuracy}%</span>
                <span className="an-stat-sub">{favCorrect}/{favPicks}</span>
              </div>
            )}
            {dogAccuracy !== null && (
              <div className="an-stat-cell">
                <span className="an-stat-label">Dogs</span>
                <span className="an-stat-value">{dogAccuracy}%</span>
                <span className="an-stat-sub">{dogCorrect}/{dogPicks}</span>
              </div>
            )}
          </div>

          {(favPicks + dogPicks) > 0 && (
            <section className="an-section">
              <h2 className="an-section-title">Distribution</h2>
              <DistBar chalkPicks={favPicks} dogPicks={dogPicks} />
            </section>
          )}

          {last10Count > 0 && (
            <section className="an-section">
              <h2 className="an-section-title">
                Form
                <span className="an-section-meta">last {last10Count} game{last10Count !== 1 ? 's' : ''} · missed picks count as a loss</span>
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
        </>
      )}

      {/* ════════════════════════════════════════════════════════
          PERSONAL VIEW
      ════════════════════════════════════════════════════════ */}
      {view === 'personal' && (
        <>
          {myOverall !== null && (
            <>
              <h2 className="an-section-title">My performance</h2>
              <div className="an-stat-strip">
                <div className="an-stat-cell">
                  <span className="an-stat-label">Overall</span>
                  <span className="an-stat-value">{myOverall}%</span>
                  <span className="an-stat-sub">{myCorrect}/{myGraded.length}</span>
                </div>
                <div className="an-stat-cell">
                  <span className="an-stat-label">Points</span>
                  <span className="an-stat-value">{myPoints}</span>
                  <span className="an-stat-sub">&nbsp;</span>
                </div>
              </div>
            </>
          )}

          {(myChalk + myDogs) > 0 && (
            <section className="an-section">
              <h2 className="an-section-title">Distribution</h2>
              <DistBar chalkPicks={myChalk} dogPicks={myDogs} />
            </section>
          )}

          {myChartRounds.length > 0 && (
            <section className="an-section">
              <h2 className="an-section-title">Accuracy by round</h2>
              <div className="mp-chart-wrap">
                <RoundChart
                  chartRounds={myChartRounds}
                  accuracyByRound={myAccuracyByRound}
                  leagueAccuracyByRound={Object.fromEntries(ROUND_ORDER.filter(r => roundStats[r]).map(r => [r, roundStats[r].accuracy]))}
                />
              </div>
            </section>
          )}

          {rankRounds.length > 0 && (
            <section className="an-section">
              <h2 className="an-section-title">Leaderboard position</h2>
              <div className="mp-rank-history">
                {rankRounds.map(r => (
                  <div key={r} className="mp-rank-cell">
                    <span className="mp-rank-round">{ROUND_SHORT[r]}</span>
                    <span className="mp-rank-num">{ordinal(myRankHistory[r])}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
