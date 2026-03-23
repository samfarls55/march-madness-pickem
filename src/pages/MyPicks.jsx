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

const ROUND_SHORT = {
  first_four:    'FF4',
  round_of_64:   'R64',
  round_of_32:   'R32',
  sweet_sixteen: 'S16',
  elite_eight:   'E8',
  final_four:    'FF',
  championship:  '🏆',
}

const ROUND_ORDER = [
  'first_four', 'round_of_64', 'round_of_32',
  'sweet_sixteen', 'elite_eight', 'final_four', 'championship',
]

function spreadForPick(game, pickedTeam) {
  const val = pickedTeam === game.home_team ? game.spread : -game.spread
  return val > 0 ? `+${val}` : `${val}`
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function RoundChart({ chartRounds, pointsByRound, accuracyByRound }) {
  if (chartRounds.length === 0) return null
  const W = 500, H = 200
  const PAD = { top: 28, right: 20, bottom: 36, left: 8 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom
  const n = chartRounds.length
  const maxPts = Math.max(...chartRounds.map(r => pointsByRound[r] || 0), 1)
  const cx = i => PAD.left + (n === 1 ? chartW / 2 : i * (chartW / (n - 1)))
  const accY = r => PAD.top + chartH - ((accuracyByRound[r] || 0) / 100) * chartH
  const ptY  = r => PAD.top + chartH - ((pointsByRound[r]  || 0) / maxPts) * chartH
  const accPath = n > 1 ? chartRounds.map((r, i) => `${i === 0 ? 'M' : 'L'}${cx(i)},${accY(r)}`).join(' ') : null
  const ptPath  = n > 1 ? chartRounds.map((r, i) => `${i === 0 ? 'M' : 'L'}${cx(i)},${ptY(r)}`).join(' ')  : null

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {[0, 25, 50, 75, 100].map(pct => {
        const y = PAD.top + chartH - (pct / 100) * chartH
        return <line key={pct} x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="var(--border)" strokeWidth="0.75" strokeDasharray="4,4" />
      })}
      {accPath && <path d={accPath} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinejoin="round" />}
      {ptPath  && <path d={ptPath}  fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />}
      {chartRounds.map((r, i) => {
        const ax = cx(i), ay = accY(r), px = cx(i), py = ptY(r)
        const acc = accuracyByRound[r] || 0
        const pts = pointsByRound[r] || 0
        return (
          <g key={r}>
            <title>{ROUND_LABELS[r]}: {acc}% accuracy, {pts} pts</title>
            <circle cx={ax} cy={ay} r={4} fill="#22c55e" />
            <text x={ax} y={Math.max(ay - 8, PAD.top - 12)} textAnchor="middle" fontSize="10" fill="#22c55e" fontFamily="monospace">{acc}%</text>
            <circle cx={px} cy={py} r={4} fill="var(--accent)" />
            <text x={px} y={Math.max(py - 8, PAD.top - 24)} textAnchor="middle" fontSize="10" fill="var(--accent)" fontFamily="monospace">{pts}pt</text>
            <text x={ax} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">{ROUND_SHORT[r]}</text>
          </g>
        )
      })}
      <circle cx={PAD.left + 8} cy={14} r={3} fill="#22c55e" />
      <text x={PAD.left + 14} y={18} fontSize="9" fill="#22c55e">Accuracy</text>
      <circle cx={PAD.left + 74} cy={14} r={3} fill="var(--accent)" />
      <text x={PAD.left + 80} y={18} fontSize="9" fill="var(--accent)">Points</text>
    </svg>
  )
}

export default function MyPicks() {
  const { session } = useAuth()
  const [games, setGames]       = useState([])
  const [pickMap, setPickMap]   = useState({})
  const [resultMap, setResultMap] = useState({})
  const [loading, setLoading]   = useState(true)
  const [selectedRound, setSelectedRound] = useState(null)
  const [rankHistory, setRankHistory] = useState({})

  useEffect(() => { loadAll() }, [session])

  async function loadAll() {
    const [{ data: g }, { data: p }, { data: r }, { data: allPicks }] = await Promise.all([
      supabase.from('games').select('*').order('date').order('tip_off_time'),
      supabase.from('picks').select('*').eq('user_id', session.user.id),
      supabase.from('results').select('*'),
      supabase.from('picks').select('user_id, game_id, points_awarded, is_correct'),
    ])

    const allGames = g || []
    setGames(allGames)

    const pm = {}
    for (const pick of p || []) pm[pick.game_id] = pick
    setPickMap(pm)

    const rm = {}
    for (const res of r || []) rm[res.game_id] = res
    setResultMap(rm)

    // Build game → round lookup
    const gameRoundMap = {}
    for (const game of allGames) gameRoundMap[game.id] = game.round

    // Compute cumulative rank at the end of each round
    const rh = {}
    for (let ri = 0; ri < ROUND_ORDER.length; ri++) {
      const round = ROUND_ORDER[ri]
      const roundSet = new Set(ROUND_ORDER.slice(0, ri + 1))
      const hasGraded = (allPicks || []).some(pk =>
        pk.is_correct !== null && pk.is_correct !== undefined &&
        roundSet.has(gameRoundMap[pk.game_id])
      )
      if (!hasGraded) continue
      const cumPoints = {}
      for (const pk of allPicks || []) {
        if (pk.is_correct === null || pk.is_correct === undefined) continue
        if (!roundSet.has(gameRoundMap[pk.game_id])) continue
        cumPoints[pk.user_id] = (cumPoints[pk.user_id] || 0) + (pk.points_awarded || 0)
      }
      const myPts = cumPoints[session.user.id] || 0
      rh[round] = Object.values(cumPoints).filter(pts => pts > myPts).length + 1
    }
    setRankHistory(rh)

    // Default round: most recent with picks
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

  const gameMap = {}
  for (const g of games) gameMap[g.id] = g

  const gradedPicks = Object.values(pickMap).filter(p => p.is_correct !== null && p.is_correct !== undefined)
  const totalCorrect = gradedPicks.filter(p => p.is_correct).length
  const totalPoints  = Object.values(pickMap).reduce((sum, p) => sum + (p.points_awarded || 0), 0)
  const overallAcc   = gradedPicks.length > 0 ? Math.round(totalCorrect / gradedPicks.length * 100) : null

  // Chalk/dog distribution of picks made
  let chalkPicks = 0, dogPicks = 0
  for (const p of Object.values(pickMap)) {
    const g = gameMap[p.game_id]
    if (!g) continue
    const isFav = (p.picked_team === g.home_team && g.spread < 0) ||
                  (p.picked_team === g.away_team && g.spread > 0)
    if (isFav) chalkPicks++; else dogPicks++
  }
  const totalDist = chalkPicks + dogPicks
  const chalkPct  = totalDist > 0 ? Math.round(chalkPicks / totalDist * 100) : null
  const dogPct    = totalDist > 0 ? 100 - chalkPct : null

  // Per-round chart data
  const chartRounds = ROUND_ORDER.filter(r =>
    gradedPicks.some(p => gameMap[p.game_id]?.round === r)
  )
  const pointsByRound = {}, accuracyByRound = {}
  for (const r of chartRounds) {
    const rp = gradedPicks.filter(p => gameMap[p.game_id]?.round === r)
    pointsByRound[r]   = rp.reduce((s, p) => s + (p.points_awarded || 0), 0)
    accuracyByRound[r] = Math.round(rp.filter(p => p.is_correct).length / rp.length * 100)
  }

  const rankRounds  = ROUND_ORDER.filter(r => rankHistory[r] !== undefined)
  const roundGames  = selectedRound ? (byRound[selectedRound] || []) : []

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

      {/* ── 1. Overall accuracy ── */}
      {overallAcc !== null && (
        <>
          <h2 className="an-section-title">My performance</h2>
          <div className="an-stat-strip">
            <div className="an-stat-cell">
              <span className="an-stat-label">Overall</span>
              <span className="an-stat-value">{overallAcc}%</span>
              <span className="an-stat-sub">{totalCorrect}/{gradedPicks.length}</span>
            </div>
            <div className="an-stat-cell">
              <span className="an-stat-label">Points</span>
              <span className="an-stat-value">{totalPoints}</span>
              <span className="an-stat-sub">&nbsp;</span>
            </div>
          </div>
        </>
      )}

      {/* ── 2. Chalk / dog distribution ── */}
      {chalkPct !== null && (
        <section className="an-section">
          <h2 className="an-section-title">Distribution</h2>
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
        </section>
      )}

      {/* ── 3. Points + Accuracy per round chart ── */}
      {chartRounds.length > 0 && (
        <section className="an-section">
          <h2 className="an-section-title">By round</h2>
          <div className="mp-chart-wrap">
            <RoundChart chartRounds={chartRounds} pointsByRound={pointsByRound} accuracyByRound={accuracyByRound} />
          </div>
        </section>
      )}

      {/* ── 4. Leaderboard history ── */}
      {rankRounds.length > 0 && (
        <section className="an-section">
          <h2 className="an-section-title">Leaderboard position</h2>
          <div className="mp-rank-history">
            {rankRounds.map(r => (
              <div key={r} className="mp-rank-cell">
                <span className="mp-rank-round">{ROUND_SHORT[r]}</span>
                <span className="mp-rank-num">{ordinal(rankHistory[r])}</span>
              </div>
            ))}
          </div>
        </section>
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

      {/* ── Picks table ── */}
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
                  if (!pick)           outcomeEl = <span><span className="mp-outcome mp-none">No pick</span>{' '}<span className="mp-score">{score}</span></span>
                  else if (pick.is_correct) outcomeEl = <span><span className="mp-outcome mp-correct">Correct</span>{' '}<span className="mp-score">{score}</span></span>
                  else                 outcomeEl = <span><span className="mp-outcome mp-wrong">Wrong</span>{' '}<span className="mp-score">{score}</span></span>
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
