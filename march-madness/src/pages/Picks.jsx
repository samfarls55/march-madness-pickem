import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const ROUND_LABELS = {
  first_four:   'First Four',
  round_of_64:  'Round of 64',
  round_of_32:  'Round of 32',
  sweet_sixteen: 'Sweet Sixteen',
  elite_eight:  'Elite Eight',
  final_four:   'Final Four',
  championship: 'Championship',
}

const ROUND_POINTS = {
  first_four: 1, round_of_64: 1, round_of_32: 1,
  sweet_sixteen: 2, elite_eight: 3, final_four: 4, championship: 5,
}

function getSpreadDisplay(isHomeTeam, homeSpread) {
  const val = isHomeTeam ? homeSpread : -homeSpread
  if (val === 0) return 'PK'
  return val > 0 ? `+${val}` : `${val}`
}

function formatTipOff(isoString) {
  const d = new Date(isoString)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

function getLockCountdown(firstGameTime) {
  const diff = new Date(firstGameTime) - new Date()
  if (diff <= 0) return null
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h >= 24) { const days = Math.floor(h / 24); return `${days}d ${h % 24}h` }
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function isSlateOpen(games) {
  if (!games.length) return false
  return new Date() < new Date(games[0].first_game_of_slate_time)
}

export default function Picks() {
  const { session } = useAuth()
  const [games, setGames]           = useState([])
  const [picks, setPicks]           = useState({})
  const [savedPicks, setSavedPicks] = useState({})
  const [tiebreaker, setTiebreaker] = useState('')
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [saveState, setSaveState]   = useState('idle')
  const [errorMsg, setErrorMsg]     = useState(null)
  const [countdown, setCountdown]   = useState(null)

  const today = new Date().toISOString().split('T')[0]
  const slateOpen = isSlateOpen(games)
  const isChampionship = games.some(g => g.round === 'championship')

  useEffect(() => {
    if (!games.length) return
    const tick = () => setCountdown(getLockCountdown(games[0].first_game_of_slate_time))
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [games])

  useEffect(() => { loadTodayData() }, [session])

  async function loadTodayData() {
    setLoading(true)
    const [{ data: todayGames }, { data: myPicks }, { data: tb }] = await Promise.all([
      supabase.from('games').select('*').eq('date', today).order('tip_off_time'),
      supabase.from('picks').select('*').eq('user_id', session.user.id),
      supabase.from('tiebreaker').select('*').eq('user_id', session.user.id).maybeSingle(),
    ])
    const gamesForToday = todayGames || []
    setGames(gamesForToday)
    const pickMap = {}
    for (const p of myPicks || []) pickMap[p.game_id] = p.picked_team
    setPicks({ ...pickMap })
    setSavedPicks({ ...pickMap })
    if (tb) setTiebreaker(String(tb.championship_total_points_guess))
    setLoading(false)
  }

  function handlePick(gameId, team) {
    if (!slateOpen) return
    setPicks(p => ({ ...p, [gameId]: team }))
    setSaveState('idle')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!slateOpen) return
    setSaving(true)
    setErrorMsg(null)
    try {
      const now = new Date()
      const upserts = games
        .filter(g => picks[g.id] && now < new Date(g.tip_off_time))
        .map(g => ({
          user_id: session.user.id,
          game_id: g.id,
          picked_team: picks[g.id],
          submitted_at: now.toISOString(),
        }))
      if (upserts.length) {
        const { error } = await supabase.from('picks').upsert(upserts, { onConflict: 'user_id,game_id' })
        if (error) throw error
      }
      if (isChampionship && tiebreaker) {
        const { error } = await supabase.from('tiebreaker').upsert(
          { user_id: session.user.id, championship_total_points_guess: parseInt(tiebreaker) },
          { onConflict: 'user_id' }
        )
        if (error) throw error
      }
      setSaveState('saved')
      await loadTodayData()
    } catch (err) {
      setErrorMsg(err.message)
      setSaveState('error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="page-shell"><div className="spinner" /></div>

  if (!games.length) {
    return (
      <div className="page-shell">
        <div className="page-header"><h1 className="page-title">Today's picks</h1></div>
        <div className="empty-state">
          <div className="empty-icon">🏀</div>
          <p>No games scheduled for today.</p>
          <p className="muted">Lines will appear here the night before each slate.</p>
        </div>
      </div>
    )
  }

  const allPicked = games.every(g => picks[g.id])
  const pickedCount = Object.values(picks).filter(Boolean).length
  const hasChanges = games.some(g => picks[g.id] !== savedPicks[g.id])

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">Today's picks</h1>
          <p className="page-subtitle">{ROUND_LABELS[games[0]?.round]} · {today}</p>
        </div>
        {slateOpen
          ? <div className="lock-badge open">Locks in {countdown}</div>
          : <div className="lock-badge locked">Locked</div>
        }
      </div>

      {!slateOpen && games.some(g => !savedPicks[g.id]) && (
        <div className="auth-message error" style={{ marginBottom: '1.25rem' }}>
          Some games tipped off without a pick. You are ineligible for last place.
        </div>
      )}

      {!slateOpen && games.some(g => !savedPicks[g.id] && new Date() < new Date(g.tip_off_time)) && (
        <div className="auth-message info" style={{ marginBottom: '1.25rem' }}>
          Slate is partially locked. You can still pick games that haven't tipped yet.
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="games-list">
          {games.map(game => {
            const myPick    = picks[game.id]
            const tippedOff = new Date() >= new Date(game.tip_off_time)
            const canPick   = !tippedOff && slateOpen
            const pts       = ROUND_POINTS[game.round]
            return (
              <div key={game.id} className={`game-card ${myPick ? 'has-pick' : ''} ${tippedOff && !savedPicks[game.id] ? 'forfeited' : ''}`}>
                <div className="game-meta">
                  <span className="game-round">{ROUND_LABELS[game.round]}</span>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span className="game-tipoff">{formatTipOff(game.tip_off_time)}</span>
                    <span className="game-points">{pts} pt{pts > 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div className="matchup">
                  <button type="button" className={`team-btn ${myPick === game.away_team ? 'selected' : ''}`}
                    onClick={() => handlePick(game.id, game.away_team)} disabled={!canPick}>
                    <span className="team-name">{game.away_team}</span>
                    <span className="team-spread">{getSpreadDisplay(false, game.spread)}</span>
                  </button>
                  <div className="matchup-vs">VS</div>
                  <button type="button" className={`team-btn ${myPick === game.home_team ? 'selected' : ''}`}
                    onClick={() => handlePick(game.id, game.home_team)} disabled={!canPick}>
                    <span className="team-name">{game.home_team}</span>
                    <span className="team-spread">{getSpreadDisplay(true, game.spread)}</span>
                  </button>
                </div>
                <div className="game-footer">
                  {tippedOff && !savedPicks[game.id] && <span className="forfeited-badge">Forfeited</span>}
                  {savedPicks[game.id] && <span className="submitted-badge">Picked: {savedPicks[game.id]}</span>}
                </div>
              </div>
            )
          })}
        </div>

        {isChampionship && slateOpen && (
          <div className="tiebreaker-card">
            <h3 className="tiebreaker-title">Tiebreaker</h3>
            <p className="tiebreaker-desc">Predict the total combined points in the Championship game. Used as tiebreaker #1.</p>
            <label className="field">
              <span className="field-label">Total combined points</span>
              <input className="field-input" type="number" min="0" max="300" placeholder="e.g. 147"
                value={tiebreaker} onChange={e => { setTiebreaker(e.target.value); setSaveState('idle') }} />
            </label>
          </div>
        )}

        {errorMsg && <div className="auth-message error" style={{ marginBottom: '1rem' }}>{errorMsg}</div>}

        {(slateOpen || hasChanges) && (
          <div className="picks-footer">
            <span className="picks-count">
              {pickedCount}/{games.length} picked
              {!allPicked && slateOpen && <span className="picks-warning"> — pick all to submit</span>}
            </span>
            <button className="btn-primary" type="submit"
              disabled={saving || !allPicked || (!hasChanges && saveState === 'saved')}>
              {saving ? 'Saving…' : saveState === 'saved' ? 'Picks saved ✓' : 'Submit picks'}
            </button>
          </div>
        )}
      </form>
    </div>
  )
}
