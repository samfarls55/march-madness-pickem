export function formatPhone(val) {
  const d = (val || '').replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function isFavorite(pick, game) {
  return (pick.picked_team === game.home_team && game.spread < 0) ||
         (pick.picked_team === game.away_team && game.spread > 0)
}
