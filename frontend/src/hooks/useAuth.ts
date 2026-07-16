import { useState, useEffect, useCallback } from 'react';
import { getCurrentUser, logout as apiLogout, login as apiLogin, register as apiRegister, User } from '../api/auth';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // On mount, check if we have a valid session via httpOnly cookie
  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const currentUser = await getCurrentUser();
        if (!cancelled) {
          setUser(currentUser);
        }
      } catch {
        // 401 — not authenticated, that's fine
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    checkAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  const saveAuth = useCallback(async (user: User) => {
    setUser(user);
  }, []);

  const performLogin = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const { user } = await apiLogin(email, password);
      setUser(user);
      return user;
    } catch (err: any) {
      const message = err.response?.data?.error || 'Login failed';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const performRegister = useCallback(async (email: string, username: string, password: string) => {
    setError(null);
    try {
      const { user } = await apiRegister(email, username, password);
      setUser(user);
      return user;
    } catch (err: any) {
      const message = err.response?.data?.error || 'Registration failed';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const performLogout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // Even if the API call fails, clear local state
    }
    setUser(null);
  }, []);

  const isAuthenticated = !!user;

  return {
    user,
    isAuthenticated,
    loading,
    error,
    saveAuth,
    login: performLogin,
    register: performRegister,
    logout: performLogout,
  };
}
