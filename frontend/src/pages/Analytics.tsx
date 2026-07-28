import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { getAnalytics } from '../api/urls';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { formatDate, formatDateTime } from '../utils';

const COLORS = ['#e94560', '#1a1a2e', '#4a90e2', '#7cb342', '#f0c040', '#e67e22', '#9b59b6', '#1abc9c'];

interface AnalyticsData {
  url: {
    shortCode: string;
    longUrl: string;
    title: string | null;
    clicks: string | number;
    createdAt: string;
    expiresAt: string | null;
    isActive: boolean;
    tags: string[];
  };
  totalClicks: number;
  recentClicks: Array<{
    id: number;
    timestamp: string;
    ipAddress: string | null;
    userAgent: string | null;
    referer: string | null;
    country: string | null;
    device: string | null;
    browser: string | null;
    os: string | null;
  }>;
  clicksByDay: Array<{ day: string; count: number }>;
  clicksByDevice: Array<{ device: string | null; count: number }>;
  clicksByBrowser: Array<{ browser: string | null; count: number }>;
  clicksByOs: Array<{ os: string | null; count: number }>;
  clicksByReferer: Array<{ referer: string | null; count: number }>;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
      {sub && <div style={styles.statSub}>{sub}</div>}
    </div>
  );
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

  if (loading) return <div style={styles.container}><LoadingSkeleton type="card" /><LoadingSkeleton type="card" /></div>;
  if (error) return (
    <div style={styles.container}>
      <div style={styles.error}>{error}</div>
      <button onClick={() => navigate('/dashboard')} style={styles.backBtn}>Back to Dashboard</button>
    </div>
  );
  if (!data) return null;

  const baseUrl = window.location.origin;

  // Calculate date range coverage
  const uniqueDays = data.clicksByDay.length;

  return (
    <div style={styles.container}>
      <div style={styles.topRow}>
        <div>
          <h2 style={styles.title}>Analytics</h2>
          {data.url.title && <p style={styles.urlTitle}>{data.url.title}</p>}
          <a href={`/${data.url.shortCode}`} target="_blank" rel="noopener noreferrer" style={styles.shortLink}>
            {baseUrl}/{data.url.shortCode}
          </a>
        </div>
        <button onClick={() => navigate('/dashboard')} style={styles.backBtn}>← Dashboard</button>
      </div>

      {/* Stats row */}
      <div style={styles.statsRow}>
        <StatCard label="Total Clicks" value={data.totalClicks.toLocaleString()} />
        <StatCard label="Active Days" value={uniqueDays} sub="with at least 1 click" />
        <StatCard label="Status" value={data.url.isActive ? '✅ Active' : '❌ Inactive'} />
        <StatCard label="Created" value={formatDate(data.url.createdAt)} />
        <StatCard label="Expires" value={data.url.expiresAt ? formatDate(data.url.expiresAt) : 'Never'} />
      </div>

      {data.url.tags?.length > 0 && (
        <div style={styles.tagsRow}>
          {data.url.tags.map(tag => <span key={tag} style={styles.tag}>{tag}</span>)}
        </div>
      )}

      {/* Clicks over time */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>📈 Clicks Over Time (last 30 days)</h3>
        {data.clicksByDay.length === 0 ? (
          <p style={styles.muted}>No click data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.clicksByDay.slice().reverse()} margin={{ top: 10, right: 10, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="day" tickFormatter={(d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} fontSize={11} tick={{ fill: '#888' }} />
              <YAxis allowDecimals={false} fontSize={11} tick={{ fill: '#888' }} />
              <Tooltip labelFormatter={(d) => new Date(d as string).toLocaleDateString()} formatter={(v) => [v, 'Clicks']} />
              <Bar dataKey="count" fill="#e94560" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Distribution charts */}
      <div style={styles.grid3}>
        {/* Device */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>📱 By Device</h3>
          {data.clicksByDevice.length === 0 ? <p style={styles.muted}>No data</p> : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={data.clicksByDevice.map(d => ({ name: d.device || 'Unknown', value: d.count }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                  {data.clicksByDevice.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Browser */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>🌐 By Browser</h3>
          {data.clicksByBrowser.length === 0 ? <p style={styles.muted}>No data</p> : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={data.clicksByBrowser.map(d => ({ name: d.browser || 'Unknown', value: d.count }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                  {data.clicksByBrowser.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* OS */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>💻 By OS</h3>
          {data.clicksByOs.length === 0 ? <p style={styles.muted}>No data</p> : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={data.clicksByOs.map(d => ({ name: d.os || 'Unknown', value: d.count }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                  {data.clicksByOs.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top referrers + Recent clicks */}
      <div style={styles.grid2}>
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>🔗 Top Referrers</h3>
          {data.clicksByReferer.length === 0 ? <p style={styles.muted}>No referrer data</p> : (
            <div style={styles.tableSmall}>
              {data.clicksByReferer.map((r, i) => (
                <div key={i} style={styles.tableRow}>
                  <span style={styles.tableLabel} title={r.referer || ''}>
                    {r.referer ? (r.referer.length > 40 ? r.referer.slice(0, 40) + '…' : r.referer) : 'Direct'}
                  </span>
                  <span style={styles.tableCount}>{r.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.card}>
          <h3 style={styles.cardTitle}>🕐 Recent Clicks</h3>
          {data.recentClicks.length === 0 ? (
            <p style={styles.muted}>No clicks yet</p>
          ) : (
            <div style={styles.clickList}>
              {data.recentClicks.map((click) => (
                <div key={click.id} style={styles.clickItem}>
                  <div style={styles.clickRow}>
                    <span style={styles.clickTime}>{formatDateTime(click.timestamp)}</span>
                    <span style={styles.clickDevice}>{click.device || 'Unknown'}</span>
                  </div>
                  <div style={styles.clickRow}>
                    <span style={styles.clickDetail}>{click.browser || '?'} / {click.os || '?'}</span>
                    {click.country && <span style={styles.clickCountry}>{click.country}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* URL details */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>ℹ️ Link Details</h3>
        <div style={styles.details}>
          <div style={styles.detailRow}><strong>Long URL</strong><span style={styles.detailVal}><a href={data.url.longUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#4a90e2' }}>{data.url.longUrl}</a></span></div>
          <div style={styles.detailRow}><strong>Short Code</strong><span style={styles.detailVal}>{data.url.shortCode}</span></div>
          <div style={styles.detailRow}><strong>Clicks</strong><span style={styles.detailVal}>{String(data.url.clicks)}</span></div>
          <div style={styles.detailRow}><strong>Created</strong><span style={styles.detailVal}>{formatDateTime(data.url.createdAt)}</span></div>
          <div style={styles.detailRow}><strong>Expires</strong><span style={styles.detailVal}>{data.url.expiresAt ? formatDateTime(data.url.expiresAt) : 'Never'}</span></div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: '1100px', margin: '0 auto', padding: '32px 20px' },
  topRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' },
  title: { color: '#1a1a2e', margin: '0 0 4px 0', fontSize: '1.6rem', fontWeight: '800' },
  urlTitle: { color: '#555', fontSize: '1rem', margin: '0 0 4px 0' },
  shortLink: { color: '#e94560', textDecoration: 'none', fontWeight: '600', fontSize: '0.95rem' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' },
  statCard: { background: '#fff', borderRadius: '10px', padding: '16px 20px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', textAlign: 'center' },
  statValue: { fontSize: '1.5rem', fontWeight: '800', color: '#1a1a2e' },
  statLabel: { fontSize: '0.78rem', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' },
  statSub: { fontSize: '0.72rem', color: '#bbb', marginTop: '2px' },
  tagsRow: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' },
  tag: { background: '#e8f4fd', color: '#1a6fa3', borderRadius: '12px', padding: '4px 12px', fontSize: '0.8rem', fontWeight: '600' },
  card: { background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: '20px' },
  cardTitle: { color: '#1a1a2e', margin: '0 0 16px 0', fontSize: '1rem', fontWeight: '700' },
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '4px' },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '4px' },
  muted: { color: '#bbb', textAlign: 'center', padding: '20px 0', margin: 0 },
  error: { padding: '12px', background: '#fff0f0', color: '#e94560', borderRadius: '8px', textAlign: 'center', marginBottom: '16px' },
  backBtn: { padding: '10px 20px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' },
  clickList: { display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '380px', overflowY: 'auto' },
  clickItem: { padding: '10px 12px', background: '#f8f9fa', borderRadius: '8px', fontSize: '0.82rem' },
  clickRow: { display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '2px' },
  clickTime: { color: '#555', fontWeight: '600' },
  clickDevice: { color: '#888' },
  clickDetail: { color: '#999' },
  clickCountry: { color: '#4a90e2', fontWeight: '600' },
  tableSmall: { display: 'flex', flexDirection: 'column', gap: '6px' },
  tableRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: '#f8f9fa', borderRadius: '6px' },
  tableLabel: { color: '#555', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' },
  tableCount: { fontWeight: '700', color: '#1a1a2e', fontSize: '0.9rem' },
  details: { display: 'flex', flexDirection: 'column', gap: '8px' },
  detailRow: { display: 'flex', gap: '16px', fontSize: '0.9rem', padding: '6px 0', borderBottom: '1px solid #f5f5f5' },
  detailVal: { color: '#555', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
};
