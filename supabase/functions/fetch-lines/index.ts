// supabase/functions/fetch-lines/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

function roundSpread(raw: number): number {
  if (!raw) return 0
  const halfRounded = Math.round(raw * 2) / 2
  if (halfRounded === Math.floor(halfRounded)) {
    return halfRounded - 0.5 * Math.sign(raw)
  }
  return halfRounded
}

// Round dates are stored in the DB (admin-configurable).
// Fetched fresh on each invocation.
async function getRoundForDate(dateStr: string): Promise<string | null> {
  const { data, error } = await supabase.from('round_dates').select('round, dates')
  if (error) throw error
  for (const row of (data ?? [])) {
    if ((row.dates ?? []).includes(dateStr)) return row.round
  }
  return null
}

// CT is UTC-5 (CDT, March–November).
// Midnight CT = 05:00 UTC. Search from 05:00 UTC on the CT date
// through 04:59 UTC the next day to cover the full CT calendar day.
function ctDayToUtcRange(ctDate: string) {
  const start = new Date(`${ctDate}T05:00:00.000Z`)
  const end   = new Date(`${ctDate}T05:00:00.000Z`)
  end.setUTCDate(end.getUTCDate() + 1)
  return {
    startRange: start.toISOString(),
    endRange:   new Date(end.getTime() - 1).toISOString(),
  }
}

async function fetchGamesForDate(dateStr: string) {
  const apiKey = Deno.env.get('CBBD_API_KEY')!
  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }

  const { startRange, endRange } = ctDayToUtcRange(dateStr)
  console.log(`UTC range: ${startRange} → ${endRange}`)

  // Response is an array of game objects, each with a nested lines[] array
  const res = await fetch(
    `https://api.collegebasketballdata.com/lines?seasonType=postseason&season=2026` +
    `&startDateRange=${encodeURIComponent(startRange)}&endDateRange=${encodeURIComponent(endRange)}`,
    { headers }
  )
  if (!res.ok) throw new Error(`Lines API error ${res.status}: ${await res.text()}`)
  const games = await res.json()

  console.log(`Games returned: ${games?.length}`)
  if (games?.length) console.log('Sample:', JSON.stringify(games[0]))
  if (!games?.length) return []

  return games.map((g: any) => {
    const lines: any[] = g.lines ?? []
    // Only consider lines that actually have a non-zero spread value
    const withSpread = lines.filter((l: any) => l.spread != null && l.spread !== 0)
    // Prefer consensus, then any provider with a spread, then fall back to first line
    const consensus = withSpread.find((l: any) => l.provider?.toLowerCase().includes('consensus'))
    const best = consensus ?? withSpread[0] ?? lines[0]
    const rawSpread = best?.spread ?? 0
    if (!rawSpread) {
      const providers = lines.map((l: any) => l.provider).join(', ')
      console.warn(`No spread for ${g.awayTeam} @ ${g.homeTeam} — providers: ${providers}`)
    }
    return {
      homeTeam:   g.homeTeam,
      awayTeam:   g.awayTeam,
      tipOffTime: g.startDate,
      rawSpread,
    }
  })
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
    // Accept optional JSON body { "date": "YYYY-MM-DD" } for manual testing
    let dateOverride: string | null = null
    try { const b = await req.json(); dateOverride = b?.date ?? null } catch (_) {}

    let dateStr: string
    if (dateOverride) {
      dateStr = dateOverride
    } else {
      // Tomorrow in CT (UTC-5 CDT)
      const nowCT = new Date(Date.now() - 5 * 60 * 60 * 1000)
      const tomorrowCT = new Date(nowCT)
      tomorrowCT.setUTCDate(tomorrowCT.getUTCDate() + 1)
      dateStr = tomorrowCT.toISOString().split('T')[0]
    }
    console.log(`Target date (CT): ${dateStr}`)

    const round = await getRoundForDate(dateStr)
    if (!round) {
      return new Response(
        JSON.stringify({ message: `No round configured for ${dateStr} — update tournament schedule in admin` }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    const games = await fetchGamesForDate(dateStr)
    if (!games.length) {
      return new Response(
        JSON.stringify({ message: `No games found for ${dateStr} — check logs` }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    const tipOffTimes = games
      .map((g: any) => new Date(g.tipOffTime).getTime())
      .filter((t: number) => !isNaN(t))
      .sort((a: number, b: number) => a - b)

    if (!tipOffTimes.length) throw new Error('Could not parse tip-off times')
    const firstGameTime = new Date(tipOffTimes[0]).toISOString()

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

    const { data: users } = await supabase
      .from('users').select('phone_number').not('phone_number', 'is', null)

    const message = `Tomorrow's picks are ready (${round.replace(/_/g, ' ')}). Submit before tip-off!`
    const smsResults = await Promise.allSettled(
      (users ?? []).map((u: any) => sendSMS(u.phone_number, message))
    )
    const smsFailed = smsResults.filter(r => r.status === 'rejected').length

    return new Response(
      JSON.stringify({
        success: true,
        date: dateStr,
        round,
        gamesInserted: rows.length,
        spreadsFound: rows.filter((r: any) => r.spread !== 0).length,
        smsSent: (users?.length ?? 0) - smsFailed,
        smsFailed,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('fetch-lines error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
