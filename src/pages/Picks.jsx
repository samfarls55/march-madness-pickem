import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const ROUND_LABELS = {
  first_four: 'First Four',
  round_of_64: 'Round of 64',
  round_of_32: 'Round of 32',
  sweet_sixteen: 'Sweet Sixteen',
  elite_eight: 'Elite Eight',
  final_four: 'Final Four',
  championship: 'Championship',
}

const ROUND_POINTS = {
  first_four: 1, round_of_64: 1, round_of_32: 1,
  sweet_sixteen: 2, elite_eight: 3, final_four: 4, championship: 5,
}

function formatSpread(spread) {
  return spread > 0 ? `+${spread}` : `${spread}`
}

function isGameOpen(game) {
  if (game.is_locked) return false
  return new Date() < new Date(game.tip_off_time)
}

function timeUntilGameLock(game) {
  const diff = new Date(game.tip_off_time) - new Date()
  if (diff <= 0) return null
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function dateLabel(dateStr, today) {
  if (dateStr === today) return 'Today'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

export default function Picks() {
  const { session } = useAuth()
  const [games, setGames] = useState([])
  const [picks, setPicks] = useState({})
  const [existingPicks, setExistingPicks] = useState({})
  const [allPicksMap, setAllPicksMap] = useState({})
  const [tiebreaker, setTiebreaker] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  const today = new Date().toISOString().split('T')[0]

  const isChampionship = games.some(g => g.round === 'championship')
  const openGames = games.filter(isGameOpen)
  const slateOpen = openGames.length > 0

  // Next-lock badge: use today's games only — tomorrow's games being open isn't urgent
  const todayGames = games.filter(g => g.date === today)
  const todayOpenGames = todayGames.filter(isGameOpen)
  const nextLockGame = todayOpenGames.sort((a, b) => new Date(a.tip_off_time) - new Date(b.tip_off_time))[0]
  const lockCountdown = nextLockGame ? timeUntilGameLock(nextLockGame) : null

  // Group all games by date, sorted
  const gamesByDate = {}
  for (const g of games) {
    if (!gamesByDate[g.date]) gamesByDate[g.date] = []
    gamesByDate[g.date].push(g)
  }
  const sortedDates = Object.keys(gamesByDate).sort()

  useEffect(() => { loadData() }, [session])

  async function loadData() {
    setLoading(true)
    const [{ data: upcomingGames }, { data: myPicks }, { data: tb }, { data: allPicksData }] = await Promise.all([
      supabase.from('games').select('*').gte('date', today).not('round', 'is', null).order('date').order('tip_off_time'),
      supabase.from('picks').select('*').eq('user_id', session.user.id),
      supabase.from('tiebreaker').select('*').eq('user_id', session.user.id).maybeSingle(),
      supabase.rpc('get_locked_game_picks', { game_date: today }),
    ])

    setGames(upcomingGames || [])

    const pickMap = {}
    const existingMap = {}
    for (const p of myPicks || []) {
      pickMap[p.game_id] = p.picked_team
      existingMap[p.game_id] = p
    }
    setPicks(pickMap)
    setExistingPicks(existingMap)
    if (tb) setTiebreaker(String(tb.championship_total_points_guess))

    const allMap = {}
    for (const p of allPicksData || []) {
      if (!allMap[p.game_id]) allMap[p.game_id] = {}
      if (!allMap[p.game_id][p.picked_team]) allMap[p.game_id][p.picked_team] = []
      allMap[p.game_id][p.picked_team].push(p.user_name ?? 'Unknown')
    }
    setAllPicksMap(allMap)

    setLoading(false)
  }

  function handlePick(game, team) {
    if (!isGameOpen(game)) return
    setPicks(p => ({ ...p, [game.id]: team }))
    setSaved(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!slateOpen) return
    setSaving(true)
    setError(null)

    try {
      const upserts = games
        .filter(g => isGameOpen(g) && picks[g.id])
        .map(g => ({ game_id: g.id, picked_team: picks[g.id] }))

      const { error: picksError } = await supabase.rpc('submit_picks', { picks: upserts })
      if (picksError) throw picksError

      if (isChampionship && tiebreaker) {
        const { error: tbError } = await supabase
          .from('tiebreaker')
          .upsert(
            { user_id: session.user.id, championship_total_points_guess: parseInt(tiebreaker) },
            { onConflict: 'user_id' }
          )
        if (tbError) throw tbError
      }

      setSaved(true)
      await loadData()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="page-shell"><div className="spinner" /></div>

  if (!games.length) {
    return (
      <div className="page-shell">
        <div className="page-header">
          <h1 className="page-title">Picks</h1>
        </div>
        <div className="empty-state">
          <div className="empty-icon">🏀</div>
          <p>No games scheduled yet.</p>
          <p className="muted">Check back when the next slate drops.</p>
        </div>
      </div>
    )
  }

  const pickedCount = openGames.filter(g => picks[g.id]).length
  const anyPicked = pickedCount > 0

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">Picks</h1>
        </div>
        {todayOpenGames.length > 0 ? (
          <div className="lock-badge open">Next lock in {lockCountdown}</div>
        ) : todayGames.length > 0 ? (
          <div className="lock-badge locked">Today locked</div>
        ) : null}
      </div>

      <form onSubmit={handleSubmit}>
        {sortedDates.map(date => {
          const dateGames = gamesByDate[date]
          return (
            <div key={date} className="slate-section">
              <div className="slate-header">
                <span className="slate-date">{dateLabel(date, today)}</span>
              </div>
              <div className="games-list">
                {dateGames.map(game => {
                  const myPick = picks[game.id]
                  const alreadySubmitted = !!existingPicks[game.id]
                  const gameOpen = isGameOpen(game)
                  const gameLockCountdown = gameOpen ? timeUntilGameLock(game) : null
                  const pts = ROUND_POINTS[game.round]

                  return (
                    <div key={game.id} className={`game-card ${myPick ? 'has-pick' : ''} ${!gameOpen ? 'locked' : ''}`}>
                      <div className="game-meta">
                        <span className="game-round">{ROUND_LABELS[game.round]} · {pts} pt{pts > 1 ? 's' : ''}</span>
                        {gameOpen
                          ? <span className="lock-badge open">Locks in {gameLockCountdown}</span>
                          : <span className="lock-badge locked">Locked</span>
                        }
                      </div>

                      <div className="matchup">
                        <button
                          type="button"
                          className={`team-btn ${myPick === game.away_team ? 'selected' : ''}`}
                          onClick={() => handlePick(game, game.away_team)}
                          disabled={!gameOpen}
                        >
                          <span className="team-name">{game.away_team}</span>
                          <span className="team-spread">{formatSpread(-game.spread)}</span>
                        </button>

                        <div className="matchup-vs">VS</div>

                        <button
                          type="button"
                          className={`team-btn ${myPick === game.home_team ? 'selected' : ''}`}
                          onClick={() => handlePick(game, game.home_team)}
                          disabled={!gameOpen}
                        >
                          <span className="team-name">{game.home_team}</span>
                          <span className="team-spread">{formatSpread(game.spread)}</span>
                        </button>
                      </div>

                      <div className="game-footer">
                        {alreadySubmitted && <span className="submitted-badge">Submitted</span>}
                      </div>

                      {!gameOpen && (() => {
                        const awayPickers = allPicksMap[game.id]?.[game.away_team] || []
                        const homePickers = allPicksMap[game.id]?.[game.home_team] || []
                        const total = awayPickers.length + homePickers.length
                        const awayPct = total ? Math.round(awayPickers.length / total * 100) : 50
                        const homePct = total ? 100 - awayPct : 50

                        function nameList(names) {
                          if (!names.length) return <span className="muted">—</span>
                          if (names.length <= 3) return names.join(', ')
                          return `${names.slice(0, 3).join(', ')} +${names.length - 3} more`
                        }

                        return (
                          <div className="picks-breakdown">
                            <span className="picks-breakdown-label">Who picked · {total} submitted</span>
                            {total > 0 && (
                              <div className="picks-split-bar">
                                <div className="picks-split-away" style={{ width: `${awayPct}%` }} />
                                <div className="picks-split-home" style={{ width: `${homePct}%` }} />
                              </div>
                            )}
                            <div className="picks-breakdown-grid">
                              {[
                                { team: game.away_team, pickers: awayPickers, pct: awayPct },
                                { team: game.home_team, pickers: homePickers, pct: homePct },
                              ].map(({ team, pickers, pct }) => (
                                <div key={team} className="picks-breakdown-col">
                                  <div className="picks-breakdown-team">{team}</div>
                                  <div className="picks-breakdown-stat">
                                    {pickers.length} <span className="picks-breakdown-pct">· {pct}%</span>
                                  </div>
                                  <div className="picks-breakdown-names">{nameList(pickers)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {isChampionship && slateOpen && (
          <div className="tiebreaker-card">
            <h3 className="tiebreaker-title">Tiebreaker</h3>
            <p className="tiebreaker-desc">
              Predict the total combined points scored in the Championship game.
            </p>
            <label className="field">
              <span className="field-label">Total points (both teams)</span>
              <input
                className="field-input"
                type="number"
                min="0"
                max="300"
                placeholder="e.g. 147"
                value={tiebreaker}
                onChange={e => setTiebreaker(e.target.value)}
              />
            </label>
          </div>
        )}

        {error && <div className="auth-message error">{error}</div>}

        {slateOpen && (
          <div className="picks-footer">
            <span className="picks-count">
              {pickedCount}/{openGames.length} picked
            </span>
            <button
              className="btn-primary"
              type="submit"
              disabled={saving || !anyPicked}
            >
              {saving ? 'Saving…' : saved ? 'Picks saved ✓' : 'Submit picks'}
            </button>
          </div>
        )}
      </form>
    </div>
  )
}
