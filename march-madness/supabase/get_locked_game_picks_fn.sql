-- Run this once in the Supabase SQL Editor.
--
-- Returns all picks for games on a given date that are locked —
-- i.e. tip_off_time has passed according to the database server clock,
-- or is_locked has been set manually by an admin.
--
-- Using a server-side function means the client cannot see picks for
-- open games by manipulating their system clock, since the time
-- comparison always uses now() on the database server.

create or replace function public.get_locked_game_picks(game_date date)
returns table(game_id uuid, picked_team text, user_name text)
language sql
security invoker
as $$
  select p.game_id, p.picked_team, u.name as user_name
  from public.picks p
  join public.games g on g.id = p.game_id
  join public.users u on u.id = p.user_id
  where g.date = game_date
    and (now() >= g.tip_off_time or g.is_locked = true);
$$;
