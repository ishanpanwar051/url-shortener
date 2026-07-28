import api from './client';

export interface ShortUrl {
  id: number;
  shortCode: string;
  shortUrl?: string;
  longUrl: string;
  title: string | null;
  customAlias: string | null;
  userId: number | null;
  clicks: string | number;
  expiresAt: string | null;
  isActive: boolean;
  tags: string[];
  password?: string | null;
  maxClicks?: string | null;
  isOneTime: boolean;
  createdAt: string;
}

export interface CreateUrlRequest {
  longUrl: string;
  customAlias?: string;
  expiresInDays?: number;
  title?: string;
  tags?: string[];
  password?: string;
  maxClicks?: number;
  isOneTime?: boolean;
}

export interface UpdateUrlRequest {
  longUrl?: string;
  isActive?: boolean;
  title?: string;
  tags?: string[];
  password?: string | null;
  maxClicks?: number | null;
  isOneTime?: boolean;
  expiresInDays?: number | null;
}

export interface UrlsResponse {
  urls: ShortUrl[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export async function createShortUrl(data: CreateUrlRequest) {
  const res = await api.post<ShortUrl>('/shorten', data);
  return res.data;
}

export async function getUserUrls(
  page = 1,
  limit = 20,
  search?: string,
  status?: 'active' | 'inactive' | 'all',
  sort?: 'createdAt' | 'clicks' | 'expiresAt',
  order?: 'asc' | 'desc',
) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) params.set('search', search);
  if (status && status !== 'all') params.set('status', status);
  if (sort) params.set('sort', sort);
  if (order) params.set('order', order);

  const res = await api.get<UrlsResponse>(`/urls?${params.toString()}`);
  return res.data;
}

export async function deleteUrl(id: number) {
  await api.delete(`/urls/${id}`);
}

export async function updateUrl(id: number, data: UpdateUrlRequest) {
  const res = await api.patch<ShortUrl>(`/urls/${id}`, data);
  return res.data;
}

export async function getAnalytics(shortCode: string) {
  const res = await api.get(`/analytics/${shortCode}`);
  return res.data;
}

export function getQRUrl(shortCode: string, size = 300) {
  return `${api.defaults.baseURL}/qr/${shortCode}?size=${size}`;
}

export async function exportUrlsCsv(): Promise<void> {
  const res = await api.get('/urls/export', { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'my-urls.csv';
  a.click();
  window.URL.revokeObjectURL(url);
}

// Admin APIs
export async function adminGetStats() {
  const res = await api.get('/admin/stats');
  return res.data;
}

export async function adminGetUsers(page = 1, search?: string) {
  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set('search', search);
  const res = await api.get(`/admin/users?${params.toString()}`);
  return res.data;
}

export async function adminUpdateUser(id: number, data: { isActive?: boolean; role?: string }) {
  const res = await api.patch(`/admin/users/${id}`, data);
  return res.data;
}

export async function adminDeleteUser(id: number) {
  await api.delete(`/admin/users/${id}`);
}

export async function adminGetUrls(page = 1, search?: string) {
  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set('search', search);
  const res = await api.get(`/admin/urls?${params.toString()}`);
  return res.data;
}

export async function adminDeleteUrl(id: number) {
  await api.delete(`/admin/urls/${id}`);
}
