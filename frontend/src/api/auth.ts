import api from './client';

export interface User {
  id: number;
  email: string;
  username: string;
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

export async function getCurrentUser() {
  const { data } = await api.get<{ user: User }>('/auth/me');
  return data.user;
}

export async function getProfile() {
  const { data } = await api.get('/auth/profile');
  return data;
}
