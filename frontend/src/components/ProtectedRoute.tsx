import React from 'react';
import { Navigate } from 'react-router-dom';

interface ProtectedRouteProps {
  isAuthenticated: boolean;
  loading?: boolean;
  children: React.ReactNode;
  redirectTo?: string;
}

export function ProtectedRoute({ isAuthenticated, loading, children, redirectTo = '/login' }: ProtectedRouteProps) {
  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>Loading...</div>;
  }
  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }
  return <>{children}</>;
}
