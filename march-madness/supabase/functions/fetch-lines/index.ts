// supabase/functions/fetch-lines/index.ts
//
// Runs nightly (~10pm CT) during the tournament via Supabase cron.
// 1. Fetches tomorrow's NCAA tournament games + spreads from collegebasketballdata.com
// 2. Rounds spreads to nearest 0.5 (avoiding whole-number pushes)
// 3. Upserts into public.games
// 4. Sends Twilio SMS to all users
//
// Required secrets (set via: supabase secrets set KEY=value):
//   CBBD_API_KEY          — from collegebasketballdata.com
//   TWILIO_ACCOUNT_SID    — from twilio.com console
//   TWILIO_AUTH_TOKEN     — from twilio.com console
//   TWILIO_FROM_NUMBER    — your purchased Twilio number e.g. +16155550100
//   SUPABASE_URL          — auto-injected by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// ── Spread rounding ────────────────────────────────────────────
// Mirrors the SQL round_spread() function exactly.
function roundSpread(raw: number): number {
  const halfRounded = Math.round(raw * 2) / 2
  // If result is a whole number, nudge 0.5 toward zero
  if (halfRounded === Math.floor(halfRounded)) {
    return halfRounded - 0.5 * Math.sign(raw)
  }
  return halfRounded
}

// ── Round detection ────────────────────────────────────────────
// Maps tournament dates to rounds. Update these dates each year.
// Source: NCAA bracket release (usually mid-March)
const TOURNAMENT_ROUNDS: Record<string, string> = {
  // First Four (Dayton, OH)  ← update dates annually
  '2026-03-19': 'first_four',
  '2026-03-20': 'first_four',
  // Round of 64
  '2026-03-21': 'round_of_64',
  '2026-03-22': 'round_of_64',
  // Round of 32
  '2026-03-23': 'round_of_32',
  '2026-03-24': 'round_of_32',
  // Sweet Sixteen
  '2026-03-26': 'sweet_sixteen',
  '2026-03-27': 'sweet_sixteen',
  // Elite Eight
  '2026-03-28': 'elite_eight',
  '2026-03-29': 'elite_eight',
  // Final Four
  '2026-04-04': 'final_four',
  // Championship
  '2026-04-06': 'championship',
}

// ── Fetch games from College Basketball Data API ───────────────
// Docs: https://collegebasketballdata.com/api/docs
// The /games endpoint returns games for a given date.
// The /lines endpoint returns spread data per game.
async function fetchTomorrowsGames(dateStr: string) {
  const apiKey = Deno.env.get('CBBD_API_KEY')!
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json',
  }

  // Step 1: fetch games for the date
  const gamesRes = await fetch(
    `https://api.collegebasketballdata.com/games?date=${dateStr}`,
    { headers }
  )
  if (!gamesRes.ok) throw new Error(`Games API error: ${gamesRes.status}`)
  const gamesData = await gamesRes.json()

  // Step 2: fetch lines (spreads) for the same date
  const linesRes = await fetch(
    `https://api.collegebasketballdata.com/lines?date=${dateStr}`,
    { headers }
  )
  if (!linesRes.ok) throw new Error(`Lines API error: ${linesRes.status}`)
  const linesData = await linesRes.json()

  // Build a map of gameId → consensus spread (home team perspective)
  // The API returns an array of line objects per game; we use the
  // consensus line when available, otherwise the first line.
  const spreadByGameId: Record<number, number> = {}
  for (const line of linesData) {
    const existing = spreadByGameId[line.gameId]
    if (!existing || line.provider === 'consensus') {
      // spread is from home team's perspective: negative = home favored
      spreadByGameId[line.gameId] = line.spread ?? line.homeSpread ?? 0
    }
  }

  // Filter to NCAA tournament games only, merge spread data
  return gamesData
    .filter((g: any) => g.seasonType === 'postseason')
    .map((g: any) => ({
      externalId:   g.id,
      homeTeam:     g.homeTeam,
      awayTeam:     g.awayTeam,
      tipOffTime:   g.startTime,   // ISO 8601 string from API
      rawSpread:    spreadByGameId[g.id] ?? 0,
    }))
}

// ── Send Twilio SMS ────────────────────────────────────────────
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
  if (!res.ok) {
    const err = await res.text()
    console.error(`SMS failed to ${to}:`, err)
  }
}

// ── Main handler ───────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    // Calculate tomorrow's date in CT
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dateStr = tomorrow.toISOString().split('T')[0]

    const round = TOURNAMENT_ROUNDS[dateStr]
    if (!round) {
      return new Response(
        JSON.stringify({ message: `No tournament games scheduled for ${dateStr}` }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Fetching games for ${dateStr} (${round})...`)

    const games = await fetchTomorrowsGames(dateStr)
    if (!games.length) {
      return new Response(
        JSON.stringify({ message: 'No postseason games found from API' }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Determine the earliest tip-off as the slate lock time
    const sortedTimes = games
      .map((g: any) => new Date(g.tipOffTime).getTime())
      .sort((a: number, b: number) => a - b)
    const firstGameTime = new Date(sortedTimes[0]).toISOString()

    // Build upsert rows
    const rows = games.map((g: any) => ({
      date:                     dateStr,
      round,
      home_team:                g.homeTeam,
      away_team:                g.awayTeam,
      spread:                   roundSpread(g.rawSpread),
      tip_off_time:             g.tipOffTime,
      first_game_of_slate_time: firstGameTime,
      is_locked:                false,
    }))

    const { error: upsertError } = await supabase
      .from('games')
      .upsert(rows, { onConflict: 'date,home_team,away_team' })

    if (upsertError) throw upsertError

    console.log(`Inserted ${rows.length} games for ${dateStr}`)

    // Fetch all users with phone numbers for SMS
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('phone_number')
      .not('phone_number', 'is', null)

    if (usersError) throw usersError

    const message = `Tomorrow's picks are ready (${round.replace(/_/g, ' ')}). Submit before tip-off!`
    const smsResults = await Promise.allSettled(
      (users ?? []).map(u => sendSMS(u.phone_number, message))
    )
    const smsFailed = smsResults.filter(r => r.status === 'rejected').length

    return new Response(
      JSON.stringify({
        success: true,
        date: dateStr,
        round,
        gamesInserted: rows.length,
        smsSent: (users?.length ?? 0) - smsFailed,
        smsFailed,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('fetch-lines error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
