export interface ClickData {
  urlId: number;
  ipAddress?: string;
  userAgent?: string;
  referer?: string;
  country?: string;
  city?: string;
  device?: string | null;
  browser?: string | null;
  os?: string | null;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  timestamp: Date;
}
