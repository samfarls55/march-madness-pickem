import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Nav } from './components/Nav'
import SignUp from './pages/SignUp'
import ResetPassword from './pages/ResetPassword'
import Picks from './pages/Picks'
import MyPicks from './pages/MyPicks'
import Leaderboard from './pages/Leaderboard'
import Admin from './pages/Admin'
import Account from './pages/Account'

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <Nav />
        <Routes>
          <Route path="/signup" element={<SignUp />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/picks" element={
            <ProtectedRoute><Picks /></ProtectedRoute>
          } />
          <Route path="/my-picks" element={
            <ProtectedRoute><MyPicks /></ProtectedRoute>
          } />
          <Route path="/leaderboard" element={
            <ProtectedRoute><Leaderboard /></ProtectedRoute>
          } />
          <Route path="/account" element={
            <ProtectedRoute><Account /></ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute adminOnly><Admin /></ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/picks" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  )
}
