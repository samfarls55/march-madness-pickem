import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function Nav() {
  const { session, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/signup')
  }

  if (!session) return null

  return (
    <nav className="nav">
      <span className="nav-logo">BRACKET<span className="nav-logo-accent">.</span></span>
      <div className="nav-links">
        <NavLink to="/picks" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          Picks
        </NavLink>
        <NavLink to="/leaderboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          Leaderboard
        </NavLink>
        {isAdmin && (
          <NavLink to="/admin" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Admin
          </NavLink>
        )}
      </div>
      <button className="nav-signout" onClick={handleSignOut}>Sign out</button>
    </nav>
  )
}
