import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { SchoolPicker } from './SchoolPicker'

export function Nav() {
  const { session, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const [pickerOpen, setPickerOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/signup')
  }

  if (!session) return null

  return (
    <>
      <nav className="nav">
        <span className="nav-logo">SPREAD<span className="nav-logo-accent">NESS</span></span>
        <div className="nav-links">
          <NavLink to="/leaderboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Leaderboard
          </NavLink>
          <NavLink to="/picks" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Make picks
          </NavLink>
          <NavLink to="/my-picks" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            My picks
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Admin
            </NavLink>
          )}
        </div>
        <button className="nav-theme-btn" onClick={() => setPickerOpen(true)} title="Choose team theme">
          🎨
        </button>
        <NavLink to="/account" className={({ isActive }) => `nav-icon-btn ${isActive ? 'active' : ''}`} title="Account settings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
        </NavLink>
        <button className="nav-signout" onClick={handleSignOut}>Sign out</button>
      </nav>

      {pickerOpen && <SchoolPicker onClose={() => setPickerOpen(false)} />}
    </>
  )
}
