import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // Supabase fires PASSWORD_RECOVERY when the user lands via the reset link
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== confirm) {
      setError({ type: 'error', message: 'Passwords do not match.' })
      return
    }
    setError(null)
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setError({ type: 'info', message: 'Password updated! Redirecting…' })
      setTimeout(() => navigate('/picks'), 1500)
    } catch (err) {
      setError({ type: 'error', message: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">MARCH <span className="accent">SPREAD</span>NESS</div>
          <p className="auth-tagline">set a new password</p>
        </div>

        <div className="auth-tabs">
          <button className="auth-tab active">Reset password</button>
        </div>

        {!ready ? (
          <div className="auth-form">
            <p className="auth-waiting">Verifying reset link…</p>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="field">
              <span className="field-label">New password</span>
              <input
                className="field-input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
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
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                minLength={8}
              />
            </label>

            {error && (
              <div className={`auth-message ${error.type}`}>
                {error.message}
              </div>
            )}

            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? 'Updating…' : 'Set new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
