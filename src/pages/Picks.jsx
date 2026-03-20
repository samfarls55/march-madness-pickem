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

function formatSpread(team, spread) {
  // spread is stored relative to home team
  // positive spread = home team is underdog; negative = home team is favored
  const val = spread > 0 ? `+${spread}` : `${spread}`
  return val
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

export default function Picks() {
  const { session } = useAuth()
  const [games, setGames] = useState([])
  const [picks, setPicks] = useState({}) // { [game_id]: picked_team }
  const [existingPicks, setExistingPicks] = useState({})
  const [tiebreaker, setTiebreaker] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  const today = new Date().toISOString().split('T')[0]
  const isChampionship = games.some(g => g.round === 'championship')
  const slateOpen = games.some(isGameOpen)
  const nextLockGame = games.filter(isGameOpen).sort((a, b) => new Date(a.tip_off_time) - new Date(b.tip_off_time))[0]
  const lockCountdown = nextLockGame ? timeUntilGameLock(nextLockGame) : null

  useEffect(() => {
    loadTodayData()
  }, [session])

  async function loadTodayData() {
    setLoading(true)
    const [{ data: todayGames }, { data: myPicks }, { data: tb }] = await Promise.all([
      supabase.from('games').select('*').eq('date', today).order('tip_off_time'),
      supabase.from('picks').select('*').eq('user_id', session.user.id),
      supabase.from('tiebreaker').select('*').eq('user_id', session.user.id).maybeSingle(),
    ])

    setGames(todayGames || [])

    const pickMap = {}
    const existingMap = {}
    for (const p of myPicks || []) {
      pickMap[p.game_id] = p.picked_team
      existingMap[p.game_id] = p
    }
    setPicks(pickMap)
    setExistingPicks(existingMap)
    if (tb) setTiebreaker(String(tb.championship_total_points_guess))
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
        .filter(g => isGameOpen(g))
        .map(g => ({
          user_id: session.user.id,
          game_id: g.id,
          picked_team: picks[g.id] || null,
          submitted_at: new Date().toISOString(),
        })).filter(u => u.picked_team)

      const { error: picksError } = await supabase
        .from('picks')
        .upsert(upserts, { onConflict: 'user_id,game_id' })

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
      await loadTodayData()
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
          <h1 className="page-title">Today's picks</h1>
        </div>
        <div className="empty-state">
          <div className="empty-icon">🏀</div>
          <p>No games scheduled for today.</p>
          <p className="muted">Check back when the next slate drops.</p>
        </div>
      </div>
    )
  }

  const openGames = games.filter(isGameOpen)
  const allPicked = openGames.every(g => picks[g.id])
  const pickedCount = openGames.filter(g => picks[g.id]).length

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">Today's picks</h1>
          <p className="page-subtitle">{ROUND_LABELS[games[0]?.round]} · {today}</p>
        </div>
        {slateOpen ? (
          <div className="lock-badge open">
            Next lock in {lockCountdown}
          </div>
        ) : (
          <div className="lock-badge locked">All locked</div>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="games-list">
          {games.map(game => {
            const myPick = picks[game.id]
            const alreadySubmitted = !!existingPicks[game.id]
            const pts = ROUND_POINTS[game.round]
            const gameOpen = isGameOpen(game)
            const gameLockCountdown = gameOpen ? timeUntilGameLock(game) : null

            return (
              <div key={game.id} className={`game-card ${myPick ? 'has-pick' : ''} ${!gameOpen ? 'locked' : ''}`}>
                <div className="game-meta">
                  <span className="game-round">{ROUND_LABELS[game.round]}</span>
                  <span className="game-points">{pts} pt{pts > 1 ? 's' : ''}</span>
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
                    <span className="team-spread">
                      {formatSpread(game.away_team, -game.spread)}
                    </span>
                  </button>

                  <div className="matchup-vs">VS</div>

                  <button
                    type="button"
                    className={`team-btn ${myPick === game.home_team ? 'selected' : ''}`}
                    onClick={() => handlePick(game, game.home_team)}
                    disabled={!gameOpen}
                  >
                    <span className="team-name">{game.home_team}</span>
                    <span className="team-spread">
                      {formatSpread(game.home_team, game.spread)}
                    </span>
                  </button>
                </div>

                <div className="game-footer">
                  {alreadySubmitted && (
                    <span className="submitted-badge">Submitted</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

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
              disabled={saving || !allPicked}
            >
              {saving ? 'Saving…' : saved ? 'Picks saved ✓' : 'Submit picks'}
            </button>
          </div>
        )}
      </form>
    </div>
  )
}
