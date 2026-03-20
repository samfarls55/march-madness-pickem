import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { SchoolPicker } from '../components/SchoolPicker'
import { useTheme } from '../context/ThemeContext'

function formatPhone(val) {
  const d = (val || '').replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

export default function Account() {
  const { session, profile, updateProfile, updateEmail, updatePassword } = useAuth()
  const { school, clearSchool } = useTheme()
  const [pickerOpen, setPickerOpen] = useState(false)

  // Profile section
  const [profileForm, setProfileForm] = useState({
    first_name: profile?.first_name ?? '',
    last_name: profile?.last_name ?? '',
    phone_number: formatPhone(profile?.phone_number ?? ''),
    venmo_username: profile?.venmo_username ?? '',
  })
  const [profileMsg, setProfileMsg] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)

  // Email section
  const [emailForm, setEmailForm] = useState({ email: session?.user?.email ?? '' })
  const [emailMsg, setEmailMsg] = useState(null)
  const [emailLoading, setEmailLoading] = useState(false)

  // Password section
  const [pwForm, setPwForm] = useState({ password: '', confirm: '' })
  const [pwMsg, setPwMsg] = useState(null)
  const [pwLoading, setPwLoading] = useState(false)

  async function handleProfileSave(e) {
    e.preventDefault()
    setProfileMsg(null)
    setProfileLoading(true)
    try {
      await updateProfile(profileForm)
      setProfileMsg({ type: 'info', message: 'Profile updated.' })
    } catch (err) {
      setProfileMsg({ type: 'error', message: err.message })
    } finally {
      setProfileLoading(false)
    }
  }

  async function handleEmailSave(e) {
    e.preventDefault()
    setEmailMsg(null)
    setEmailLoading(true)
    try {
      await updateEmail(emailForm.email)
      setEmailMsg({ type: 'info', message: 'Confirmation sent to your new email address.' })
    } catch (err) {
      setEmailMsg({ type: 'error', message: err.message })
    } finally {
      setEmailLoading(false)
    }
  }

  async function handlePasswordSave(e) {
    e.preventDefault()
    if (pwForm.password !== pwForm.confirm) {
      setPwMsg({ type: 'error', message: 'Passwords do not match.' })
      return
    }
    setPwMsg(null)
    setPwLoading(true)
    try {
      await updatePassword(pwForm.password)
      setPwForm({ password: '', confirm: '' })
      setPwMsg({ type: 'info', message: 'Password updated.' })
    } catch (err) {
      setPwMsg({ type: 'error', message: err.message })
    } finally {
      setPwLoading(false)
    }
  }

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <h1 className="page-title">Account</h1>
          <p className="page-subtitle">{session?.user?.email}</p>
        </div>
      </div>

      {/* ── Profile ── */}
      <section className="acct-section">
        <h2 className="acct-section-title">Profile</h2>
        <form className="acct-form" onSubmit={handleProfileSave}>
          <div className="field-row">
            <label className="field">
              <span className="field-label">First name</span>
              <input
                className="field-input"
                type="text"
                value={profileForm.first_name}
                onChange={e => setProfileForm(f => ({ ...f, first_name: e.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Last name</span>
              <input
                className="field-input"
                type="text"
                value={profileForm.last_name}
                onChange={e => setProfileForm(f => ({ ...f, last_name: e.target.value }))}
                required
              />
            </label>
          </div>
          <label className="field">
            <span className="field-label">Phone number</span>
            <input
              className="field-input"
              type="tel"
              placeholder="(615) 555-0100"
              value={profileForm.phone_number}
              onChange={e => setProfileForm(f => ({ ...f, phone_number: formatPhone(e.target.value) }))}
            />
          </label>
          <label className="field">
            <span className="field-label">Venmo username</span>
            <div className="field-prefix-wrap">
              <span className="field-prefix">@</span>
              <input
                className="field-input"
                type="text"
                placeholder="username"
                value={profileForm.venmo_username}
                onChange={e => setProfileForm(f => ({ ...f, venmo_username: e.target.value.replace(/^@+/, '') }))}
                required
              />
            </div>
          </label>
          {profileMsg && <div className={`auth-message ${profileMsg.type}`}>{profileMsg.message}</div>}
          <button className="btn-primary acct-btn" type="submit" disabled={profileLoading}>
            {profileLoading ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </section>

      {/* ── Email ── */}
      <section className="acct-section">
        <h2 className="acct-section-title">Email address</h2>
        <form className="acct-form" onSubmit={handleEmailSave}>
          <label className="field">
            <span className="field-label">Email</span>
            <input
              className="field-input"
              type="email"
              value={emailForm.email}
              onChange={e => setEmailForm({ email: e.target.value })}
              required
            />
          </label>
          <p className="acct-hint">A confirmation link will be sent to the new address.</p>
          {emailMsg && <div className={`auth-message ${emailMsg.type}`}>{emailMsg.message}</div>}
          <button className="btn-primary acct-btn" type="submit" disabled={emailLoading}>
            {emailLoading ? 'Sending…' : 'Update email'}
          </button>
        </form>
      </section>

      {/* ── Password ── */}
      <section className="acct-section">
        <h2 className="acct-section-title">Password</h2>
        <form className="acct-form" onSubmit={handlePasswordSave}>
          <label className="field">
            <span className="field-label">New password</span>
            <input
              className="field-input"
              type="password"
              placeholder="••••••••"
              value={pwForm.password}
              onChange={e => setPwForm(f => ({ ...f, password: e.target.value }))}
              required
              minLength={8}
            />
          </label>
          <label className="field">
            <span className="field-label">Confirm password</span>
            <input
              className="field-input"
              type="password"
              placeholder="••••••••"
              value={pwForm.confirm}
              onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
              required
              minLength={8}
            />
          </label>
          {pwMsg && <div className={`auth-message ${pwMsg.type}`}>{pwMsg.message}</div>}
          <button className="btn-primary acct-btn" type="submit" disabled={pwLoading}>
            {pwLoading ? 'Updating…' : 'Change password'}
          </button>
        </form>
      </section>

      {/* ── Theme ── */}
      <section className="acct-section">
        <h2 className="acct-section-title">Team theme</h2>
        <div className="acct-theme-row">
          <div className="acct-theme-info">
            {school ? (
              <>
                <span className="acct-swatches">
                  <span className="sp-swatch" style={{ background: school.primary }} />
                  <span className="sp-swatch" style={{ background: school.secondary }} />
                </span>
                <span className="acct-theme-name">{school.name}</span>
              </>
            ) : (
              <span className="acct-theme-name muted">Default theme</span>
            )}
          </div>
          <div className="acct-theme-actions">
            <button className="btn-secondary" onClick={() => setPickerOpen(true)}>
              Change
            </button>
            {school && (
              <button className="btn-ghost" onClick={clearSchool}>
                Reset
              </button>
            )}
          </div>
        </div>
      </section>

      {pickerOpen && <SchoolPicker onClose={() => setPickerOpen(false)} />}
    </div>
  )
}
