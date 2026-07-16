import api from './client';

export interface ShortUrl {
  id: number;
  shortCode: string;
  longUrl: string;
  customAlias: string | null;
  userId: number | null;
  clicks: number;
  expiresAt: string;
  isActive: boolean;
  createdAt: string;
}

export interface CreateUrlRequest {
  longUrl: string;
  customAlias?: string;
  expiresInDays?: number;
}

export async function createShortUrl(data: CreateUrlRequest) {
  const res = await api.post<ShortUrl>('/shorten', data);
  return res.data;
}

export async function getUserUrls(page = 1, limit = 20) {
  const res = await api.get<{ urls: ShortUrl[]; total: number; page: number; totalPages: number }>(
    `/urls?page=${page}&limit=${limit}`
  );
  return res.data;
}

export async function deleteUrl(id: number) {
  await api.delete(`/urls/${id}`);
}

export interface UpdateUrlRequest {
  longUrl?: string;
  isActive?: boolean;
}

export async function updateUrl(id: number, data: UpdateUrlRequest) {
  const res = await api.patch<ShortUrl>(`/urls/${id}`, data);
  return res.data;
}

export async function getAnalytics(shortCode: string) {
  const res = await api.get(`/analytics/${shortCode}`);
  return res.data;
}

export function getQRUrl(shortCode: string) {
  return `${api.defaults.baseURL}/qr/${shortCode}`;
}
