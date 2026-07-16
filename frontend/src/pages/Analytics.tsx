import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { getAnalytics } from '../api/urls';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { formatDateTime } from '../utils';

interface ClickByDay {
  day: string;
  count: number;
}

interface AnalyticsData {
  url: {
    shortCode: string;
    longUrl: string;
    clicks: number;
    createdAt: string;
    expiresAt: string;
    isActive: boolean;
  };
  totalClicks: number;
  recentClicks: Array<{
    id: number;
    timestamp: string;
    ipAddress: string;
    userAgent: string;
    referer: string;
    country: string | null;
    device: string | null;
  }>;
  clickByDay: ClickByDay[];
}

export function Analytics() {
  const { shortCode } = useParams<{ shortCode: string }>();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!shortCode) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await getAnalytics(shortCode);
        setData(result);
      } catch {
        setError('Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [shortCode]);

  if (loading) return <div style={styles.container}><LoadingSkeleton type="card" /></div>;
  if (error) return (
    <div style={styles.container}>
      <div style={styles.error}>{error}</div>
      <button onClick={() => navigate('/dashboard')} style={styles.backBtn}>
        Back to Dashboard
      </button>
    </div>
  );
  if (!data) return null;

  const baseUrl = window.location.origin;

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Analytics</h2>

      <div style={styles.card}>
        <div style={styles.info}>
          <div>
            <strong>Short URL:</strong>{' '}
            <a href={`/${data.url.shortCode}`} target="_blank" rel="noopener noreferrer" style={styles.link}>
              {baseUrl}/{data.url.shortCode}
            </a>
          </div>
          <div style={styles.longUrl}><strong>Long URL:</strong> {data.url.longUrl}</div>
          <div><strong>Total Clicks:</strong> {data.totalClicks}</div>
          <div><strong>Status:</strong> {data.url.isActive ? 'Active' : 'Expired'}</div>
          <div><strong>Created:</strong> {formatDateTime(data.url.createdAt)}</div>
          <div><strong>Expires:</strong> {formatDateTime(data.url.expiresAt)}</div>
        </div>
      </div>

      <div style={styles.grid}>
        <div style={styles.card}>
          <h3>Clicks Over Time</h3>
          {data.clickByDay.length === 0 ? (
            <p style={styles.muted}>No clicks yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.clickByDay.slice().reverse()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="day"
                  tickFormatter={(d: string) => new Date(d).toLocaleDateString()}
                  fontSize={12}
                />
                <YAxis allowDecimals={false} />
                <Tooltip
                  labelFormatter={(d) => new Date(d as string).toLocaleDateString()}
                  formatter={(value) => [value, 'Clicks']}
                />
                <Bar dataKey="count" fill="#e94560" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={styles.card}>
          <h3>Recent Clicks</h3>
          {data.recentClicks.length === 0 ? (
            <p style={styles.muted}>No clicks yet</p>
          ) : (
            <div style={styles.clickList}>
              {data.recentClicks.map((click) => (
                <div key={click.id} style={styles.clickItem}>
                  <div><strong>Time:</strong> {formatDateTime(click.timestamp)}</div>
                  <div><strong>IP:</strong> {click.ipAddress || 'N/A'}</div>
                  <div><strong>Device:</strong> {click.device || 'N/A'}</div>
                  <div style={styles.overflowText}><strong>UA:</strong> {click.userAgent || 'N/A'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <button onClick={() => navigate('/dashboard')} style={styles.backBtn}>
        Back to Dashboard
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '1000px',
    margin: '0 auto',
    padding: '32px 20px',
  },
  title: {
    color: '#1a1a2e',
    marginBottom: '24px',
  },
  error: {
    padding: '12px',
    background: '#fff0f0',
    color: '#e94560',
    borderRadius: '8px',
    textAlign: 'center',
  },
  card: {
    background: '#fff',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
    marginBottom: '20px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
  },
  info: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    fontSize: '0.95rem',
  },
  link: {
    color: '#e94560',
    textDecoration: 'none',
  },
  longUrl: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  muted: {
    color: '#999',
    textAlign: 'center',
    padding: '20px',
  },
  clickList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxHeight: '400px',
    overflowY: 'auto',
  },
  clickItem: {
    padding: '10px',
    background: '#f8f9fa',
    borderRadius: '6px',
    fontSize: '0.85rem',
  },
  overflowText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  backBtn: {
    marginTop: '20px',
    padding: '12px 24px',
    background: '#1a1a2e',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '1rem',
  },
};
