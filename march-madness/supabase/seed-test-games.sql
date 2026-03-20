-- ============================================================
-- TEST SEED — Today's games for picks form development
-- Run in Supabase SQL Editor to see the picks form in action.
-- Delete these rows before going live with real games.
-- ============================================================

-- Wipe today's test games first (safe to re-run)
delete from public.games
where date = current_date
  and home_team in ('Duke', 'Kansas', 'Houston', 'Alabama');

-- Insert today's test slate (Round of 64)
-- Tip-offs staggered; first game locks the whole slate
insert into public.games
  (date, round, home_team, away_team, spread, tip_off_time, first_game_of_slate_time, is_locked)
values
  (
    current_date,
    'round_of_64',
    'Duke',
    'Vermont',
    -14.5,  -- Duke favored by 14.5
    (current_date + interval '12 hours 10 minutes')::timestamptz at time zone 'America/Chicago',
    (current_date + interval '12 hours 10 minutes')::timestamptz at time zone 'America/Chicago',
    false
  ),
  (
    current_date,
    'round_of_64',
    'Kansas',
    'Samford',
    -9.5,
    (current_date + interval '12 hours 40 minutes')::timestamptz at time zone 'America/Chicago',
    (current_date + interval '12 hours 10 minutes')::timestamptz at time zone 'America/Chicago',
    false
  ),
  (
    current_date,
    'round_of_64',
    'Houston',
    'Longwood',
    -18.5,
    (current_date + interval '15 hours 25 minutes')::timestamptz at time zone 'America/Chicago',
    (current_date + interval '12 hours 10 minutes')::timestamptz at time zone 'America/Chicago',
    false
  ),
  (
    current_date,
    'round_of_64',
    'Alabama',
    'Charleston',
    -11.5,
    (current_date + interval '17 hours 50 minutes')::timestamptz at time zone 'America/Chicago',
    (current_date + interval '12 hours 10 minutes')::timestamptz at time zone 'America/Chicago',
    false
  );

select id, home_team, away_team, spread, tip_off_time, is_locked
from public.games
where date = current_date
order by tip_off_time;
