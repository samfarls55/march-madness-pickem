import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function SignUp() {
  const { signUp, signIn } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('signup') // 'signup' | 'signin' | 'forgotpw'
  const [form, setForm] = useState({ name: '', email: '', phone_number: '', venmo_username: '', password: '' })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  function update(field) {
    return (e) => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  function switchMode(m) {
    setMode(m)
    setError(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'signup') {
        await signUp(form)
        setError({ type: 'info', message: 'Check your email to confirm your account, then sign in.' })
      } else if (mode === 'signin') {
        await signIn({ email: form.email, password: form.password })
        navigate('/picks')
      } else if (mode === 'forgotpw') {
        const { error } = await supabase.auth.resetPasswordForEmail(form.email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (error) throw error
        setError({ type: 'info', message: 'Password reset link sent — check your email.' })
      }
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
          <p className="auth-tagline">march madness · against the spread</p>
        </div>

        {mode !== 'forgotpw' && (
          <div className="auth-tabs">
            <button
              className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
              onClick={() => switchMode('signup')}
            >
              Sign up
            </button>
            <button
              className={`auth-tab ${mode === 'signin' ? 'active' : ''}`}
              onClick={() => switchMode('signin')}
            >
              Sign in
            </button>
          </div>
        )}

        {mode === 'forgotpw' && (
          <div className="auth-tabs">
            <button className="auth-tab active">Reset password</button>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <>
              <label className="field">
                <span className="field-label">Full name</span>
                <input
                  className="field-input"
                  type="text"
                  placeholder="Pat Riley"
                  value={form.name}
                  onChange={update('name')}
                  required
                />
              </label>
              <label className="field">
                <span className="field-label">Phone number</span>
                <input
                  className="field-input"
                  type="tel"
                  placeholder="+1 (615) 555-0100"
                  value={form.phone_number}
                  onChange={update('phone_number')}
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
                    value={form.venmo_username}
                    onChange={e => setForm(f => ({ ...f, venmo_username: e.target.value.replace(/^@+/, '') }))}
                    required
                  />
                </div>
              </label>
            </>
          )}

          <label className="field">
            <span className="field-label">Email</span>
            <input
              className="field-input"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={update('email')}
              required
            />
          </label>

          {mode !== 'forgotpw' && (
            <label className="field">
              <span className="field-label">Password</span>
              <input
                className="field-input"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={update('password')}
                required
                minLength={8}
              />
            </label>
          )}

          {error && (
            <div className={`auth-message ${error.type}`}>
              {error.message}
            </div>
          )}

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Please wait…'
              : mode === 'signup' ? 'Create account'
              : mode === 'forgotpw' ? 'Send reset link'
              : 'Sign in'}
          </button>

          {mode === 'signin' && (
            <button
              type="button"
              className="auth-link"
              onClick={() => switchMode('forgotpw')}
            >
              Forgot password?
            </button>
          )}

          {mode === 'forgotpw' && (
            <button
              type="button"
              className="auth-link"
              onClick={() => switchMode('signin')}
            >
              Back to sign in
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
