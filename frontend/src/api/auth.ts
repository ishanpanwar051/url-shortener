import api from './client';

export interface User {
  id: number;
  email: string;
  username: string;
  role: string;
}

export interface AuthResponse {
  user: User;
}

export async function register(email: string, username: string, password: string) {
  const { data } = await api.post<AuthResponse>('/auth/register', { email, username, password });
  return data;
}

export async function login(email: string, password: string) {
  const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
  return data;
}

export async function logout() {
  const { data } = await api.post('/auth/logout');
  return data;
}

export async function getCurrentUser(): Promise<User> {
  const { data } = await api.get<{ user: User } | User>('/auth/me');
  if ('user' in data && data.user) {
    return data.user;
  }
  return { id: (data as User).id, email: (data as User).email, username: (data as User).username, role: (data as User).role || 'USER' };
}

export async function getProfile() {
  const { data } = await api.get('/auth/profile');
  return data;
}
