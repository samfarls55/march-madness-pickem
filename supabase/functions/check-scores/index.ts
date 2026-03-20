// supabase/functions/check-scores/index.ts
//
// Runs every 15 minutes on game days via Supabase cron.
// 1. Loads today's unscored games from our DB
// 2. Fetches finalized scores from the College Basketball Data API
// 3. Determines ATS winner and writes to results table
// 4. Scores all picks for each finalized game
// 5. Sends SMS when the full day's slate is complete

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const ROUND_POINTS: Record<string, number> = {
  first_four:    1,
  round_of_64:   1,
  round_of_32:   1,
  sweet_sixteen: 2,
  elite_eight:   3,
  final_four:    4,
  championship:  5,
}

// CT = UTC-5 (CDT). Midnight CT = 05:00 UTC.
function ctDayToUtcRange(ctDate: string) {
  const start = new Date(`${ctDate}T05:00:00.000Z`)
  const end   = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)
  return { startRange: start.toISOString(), endRange: end.toISOString() }
}

// ATS winner: spread is home team's line (negative = home favored).
// home covers if (homePoints - awayPoints) + spread > 0.
// Spreads are always .5 so pushes are impossible.
function atsWinner(
  homeTeam: string,
  awayTeam: string,
  homePoints: number,
  awayPoints: number,
  spread: number
): string {
  return (homePoints - awayPoints) + spread > 0 ? homeTeam : awayTeam
}

async function sendSMS(to: string, body: string) {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
  const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN')!
  const from       = Deno.env.get('TWILIO_FROM_NUMBER')!
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    }
  )
  if (!res.ok) console.error(`SMS failed to ${to}:`, await res.text())
}

Deno.serve(async (req) => {
  try {
    // Accept optional { "date": "YYYY-MM-DD" } for manual testing
    let dateOverride: string | null = null
    try { const b = await req.json(); dateOverride = b?.date ?? null } catch (_) {}

    let dateStr: string
    if (dateOverride) {
      dateStr = dateOverride
    } else {
      const nowCT = new Date(Date.now() - 5 * 60 * 60 * 1000)
      dateStr = nowCT.toISOString().split('T')[0]
    }
    console.log(`Checking scores for: ${dateStr}`)

    // ── Step 1: Load today's games from DB ─────────────────────
    const { data: dbGames, error: dbErr } = await supabase
      .from('games')
      .select('id, home_team, away_team, spread, round')
      .eq('date', dateStr)

    if (dbErr) throw dbErr
    if (!dbGames?.length) {
      return new Response(
        JSON.stringify({ message: `No games in DB for ${dateStr}` }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }
    console.log(`DB games: ${dbGames.length}`)

    // Skip games that already have results
    const { data: existingResults } = await supabase
      .from('results')
      .select('game_id')
      .in('game_id', dbGames.map(g => g.id))

    const alreadyScored = new Set((existingResults ?? []).map(r => r.game_id))
    const pendingGames = dbGames.filter(g => !alreadyScored.has(g.id))
    console.log(`Pending games: ${pendingGames.length}`)

    if (!pendingGames.length) {
      return new Response(
        JSON.stringify({ message: 'All games already scored', date: dateStr }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ── Step 2: Fetch only finalized NCAA games from API ───────
    const apiKey = Deno.env.get('CBBD_API_KEY')!
    const headers = { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }
    const { startRange, endRange } = ctDayToUtcRange(dateStr)

    const url = `https://api.collegebasketballdata.com/games` +
      `?seasonType=postseason&season=2026&tournament=NCAA&status=final` +
      `&startDateRange=${encodeURIComponent(startRange)}` +
      `&endDateRange=${encodeURIComponent(endRange)}`

    console.log(`Fetching: ${url}`)
    const scoresRes = await fetch(url, { headers })
    if (!scoresRes.ok) throw new Error(`API error ${scoresRes.status}: ${await scoresRes.text()}`)
    const finalGames = await scoresRes.json()

    console.log(`Finalized games from API: ${finalGames?.length}`)

    // Index by "HomeTeam|AwayTeam" to match our DB records
    const apiByMatchup: Record<string, any> = {}
    for (const g of (finalGames ?? [])) {
      apiByMatchup[`${g.homeTeam}|${g.awayTeam}`] = g
    }

    // ── Step 3: Score each pending game that's now final ───────
    let gamesScored = 0
    let picksScored = 0

    for (const dbGame of pendingGames) {
      const key = `${dbGame.home_team}|${dbGame.away_team}`
      const apiGame = apiByMatchup[key]

      if (!apiGame) {
        console.log(`Not final yet: ${key}`)
        continue
      }

      const homePoints = apiGame.homePoints ?? 0
      const awayPoints = apiGame.awayPoints ?? 0
      const winner = atsWinner(dbGame.home_team, dbGame.away_team, homePoints, awayPoints, dbGame.spread)

      console.log(`${dbGame.away_team} ${awayPoints} @ ${dbGame.home_team} ${homePoints} — ATS: ${winner}`)

      // Write result row
      const { error: resultErr } = await supabase
        .from('results')
        .upsert({
          game_id:                dbGame.id,
          home_score:             homePoints,
          away_score:             awayPoints,
          winning_team_vs_spread: winner,
          finalized_at:           new Date().toISOString(),
        }, { onConflict: 'game_id' })

      if (resultErr) {
        console.error(`Result write failed for ${key}:`, resultErr)
        continue
      }

      // Score all picks for this game
      const { data: gamePicks, error: picksErr } = await supabase
        .from('picks')
        .select('id, picked_team')
        .eq('game_id', dbGame.id)

      if (picksErr) {
        console.error(`Picks load failed for ${key}:`, picksErr)
        continue
      }

      const pts = ROUND_POINTS[dbGame.round] ?? 1

      for (const pick of (gamePicks ?? [])) {
        const isCorrect = pick.picked_team === winner
        await supabase
          .from('picks')
          .update({
            is_correct:     isCorrect,
            points_awarded: isCorrect ? pts : 0,
          })
          .eq('id', pick.id)
      }

      gamesScored++
      picksScored += gamePicks?.length ?? 0
      console.log(`Scored ${gamePicks?.length} picks for ${key}`)
    }

    // ── Step 4: Send SMS if full slate is now complete ─────────
    const { data: allResults } = await supabase
      .from('results')
      .select('game_id')
      .in('game_id', dbGames.map(g => g.id))

    const allDone = (allResults?.length ?? 0) >= dbGames.length

    if (allDone && gamesScored > 0) {
      console.log('Full slate complete — sending results SMS')
      const { data: users } = await supabase
        .from('users').select('phone_number').not('phone_number', 'is', null)

      await Promise.allSettled(
        (users ?? []).map((u: any) =>
          sendSMS(u.phone_number, `Results are in for ${dateStr} — check the leaderboard!`)
        )
      )
    }

    return new Response(
      JSON.stringify({
        success:      true,
        date:         dateStr,
        gamesScored,
        picksScored,
        allFinalized: allDone,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    console.error('check-scores error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
