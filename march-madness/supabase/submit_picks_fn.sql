-- Run this once in the Supabase SQL Editor.
--
-- Creates a server-side function that validates picks against game tip-off
-- times using the database server clock (now()), preventing users from
-- bypassing locks by changing their system time.
--
-- The function silently skips any games that have already started and
-- returns a count of inserted vs skipped picks.

create or replace function public.submit_picks(picks jsonb)
returns jsonb
language plpgsql
security invoker   -- runs as the authenticated user; respects existing RLS
as $$
declare
  p        jsonb;
  g        record;
  inserted int := 0;
  skipped  int := 0;
begin
  for p in select * from jsonb_array_elements(picks)
  loop
    -- Look up the game on the server
    select * into g
    from public.games
    where id = (p->>'game_id')::uuid;

    if g is null then
      continue;
    end if;

    -- Server-side lock check — uses database now(), not client clock
    if now() >= g.tip_off_time or g.is_locked then
      skipped := skipped + 1;
      continue;
    end if;

    insert into public.picks (user_id, game_id, picked_team, submitted_at)
    values (
      auth.uid(),
      g.id,
      p->>'picked_team',
      now()
    )
    on conflict (user_id, game_id) do update set
      picked_team  = excluded.picked_team,
      submitted_at = excluded.submitted_at;

    inserted := inserted + 1;
  end loop;

  return jsonb_build_object('inserted', inserted, 'skipped', skipped);
end;
$$;
