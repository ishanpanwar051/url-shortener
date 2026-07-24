export interface ClickData {
  urlId: number;
  ipAddress?: string;
  userAgent?: string;
  referer?: string;
  country?: string;
  device?: string | null;
  timestamp: Date;
}
