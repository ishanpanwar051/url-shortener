import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuth } from './hooks/useAuth';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { Analytics } from './pages/Analytics';
import { AdminPanel } from './pages/AdminPanel';
import { NotFound } from './pages/NotFound';

export default function App() {
  const { isAuthenticated, isAdmin, user, saveAuth, logout, loading } = useAuth();

  return (
    <div style={styles.app}>
      <Navbar
        isAuthenticated={isAuthenticated}
        isAdmin={isAdmin}
        username={user?.username}
        onLogout={logout}
      />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login onLogin={saveAuth} />} />
        <Route path="/register" element={<Register onLogin={saveAuth} />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated} loading={loading}>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics/:shortCode"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated} loading={loading}>
              <Analytics />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute isAuthenticated={isAuthenticated} loading={loading} redirectTo="/login">
              {isAdmin ? <AdminPanel /> : <NotFound />}
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    minHeight: '100vh',
    background: '#f5f5f5',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
};
