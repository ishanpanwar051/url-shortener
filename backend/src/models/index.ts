export interface CreateUrlInput {
  longUrl: string;
  customAlias?: string;
  expiresInDays?: number;
}

export interface UpdateUrlInput {
  longUrl?: string;
  isActive?: boolean;
}

export interface PaginatedResult<T> {
  urls: T[];
  total: number;
  page: number;
  totalPages: number;
}

export interface AnalyticsResult {
  url: {
    shortCode: string;
    longUrl: string;
    clicks: number;
    createdAt: Date;
    expiresAt: Date | null;
    isActive: boolean;
  };
  totalClicks: number;
  recentClicks: Array<{
    id: number;
    timestamp: Date;
    ipAddress: string | null;
    userAgent: string | null;
    referer: string | null;
    country: string | null;
    device: string | null;
  }>;
  clickByDay: Array<{ day: string; count: bigint }>;
}

export interface ClickData {
  urlId: number;
  ipAddress?: string;
  userAgent?: string;
  referer?: string;
  country?: string;
  device?: string | null;
  timestamp: Date;
}
