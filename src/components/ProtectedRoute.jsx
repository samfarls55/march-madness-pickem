import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function ProtectedRoute({ children, adminOnly = false }) {
  const { session, isAdmin } = useAuth()

  // session === undefined means still loading
  if (session === undefined) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (!session) return <Navigate to="/signup" replace />
  if (adminOnly && !isAdmin) return <Navigate to="/picks" replace />

  return children
}
