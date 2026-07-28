import React, { useEffect, useState, useCallback } from 'react';
import { adminGetStats, adminGetUsers, adminUpdateUser, adminDeleteUser, adminGetUrls, adminDeleteUrl } from '../api/urls';
import { truncate } from '../utils';

type Tab = 'stats' | 'users' | 'urls';

interface SystemStats {
  totalUsers: number;
  totalUrls: number;
  totalClicks: number;
  activeUrls: number;
}

interface AdminUser {
  id: number;
  email: string;
  username: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  _count: { urls: number };
}

interface AdminUrl {
  id: number;
  shortCode: string;
  longUrl: string;
  clicks: string | number;
  isActive: boolean;
  createdAt: string;
  owner: { id: number; email: string; username: string } | null;
}

export function AdminPanel() {
  const [tab, setTab] = useState<Tab>('stats');
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [urls, setUrls] = useState<AdminUrl[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [urlTotal, setUrlTotal] = useState(0);
  const [userPage, setUserPage] = useState(1);
  const [urlPage, setUrlPage] = useState(1);
  const [userPages, setUserPages] = useState(1);
  const [urlPages, setUrlPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [urlSearch, setUrlSearch] = useState('');

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminGetStats();
      setStats(data);
    } catch {
      setError('Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminGetUsers(userPage, userSearch || undefined);
      setUsers(data.users);
      setUserTotal(data.total);
      setUserPages(data.totalPages);
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [userPage, userSearch]);

  const loadUrls = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminGetUrls(urlPage, urlSearch || undefined);
      setUrls(data.urls);
      setUrlTotal(data.total);
      setUrlPages(data.totalPages);
    } catch {
      setError('Failed to load URLs');
    } finally {
      setLoading(false);
    }
  }, [urlPage, urlSearch]);

  useEffect(() => { if (tab === 'stats') loadStats(); }, [tab, loadStats]);
  useEffect(() => { if (tab === 'users') loadUsers(); }, [tab, loadUsers]);
  useEffect(() => { if (tab === 'urls') loadUrls(); }, [tab, loadUrls]);

  const handleToggleUserActive = async (user: AdminUser) => {
    if (!window.confirm(`${user.isActive ? 'Deactivate' : 'Activate'} user ${user.username}?`)) return;
    try {
      await adminUpdateUser(user.id, { isActive: !user.isActive });
      loadUsers();
    } catch {
      setError('Failed to update user');
    }
  };

  const handleToggleRole = async (user: AdminUser) => {
    const newRole = user.role === 'ADMIN' ? 'USER' : 'ADMIN';
    if (!window.confirm(`${newRole === 'ADMIN' ? 'Promote' : 'Demote'} ${user.username} to ${newRole}?`)) return;
    try {
      await adminUpdateUser(user.id, { role: newRole });
      loadUsers();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to change role');
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    if (!window.confirm(`DELETE user ${user.username}? This will also delete all their URLs.`)) return;
    try {
      await adminDeleteUser(user.id);
      loadUsers();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to delete user');
    }
  };

  const handleDeleteUrl = async (id: number, shortCode: string) => {
    if (!window.confirm(`Delete URL /${shortCode}?`)) return;
    try {
      await adminDeleteUrl(id);
      loadUrls();
    } catch {
      setError('Failed to delete URL');
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'stats', label: '📊 Overview' },
    { key: 'users', label: '👥 Users' },
    { key: 'urls', label: '🔗 URLs' },
  ];

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Admin Panel</h2>
      <p style={styles.subtitle}>Manage users, URLs, and system health</p>

      <div style={styles.tabs}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setError(''); }} style={{ ...styles.tab, ...(tab === t.key ? styles.tabActive : {}) }}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <div style={styles.error}>{error} <button onClick={() => setError('')} style={styles.errClose}>×</button></div>}

      {/* Stats Tab */}
      {tab === 'stats' && (
        <div>
          {loading ? <div style={styles.loading}>Loading...</div> : stats ? (
            <div style={styles.statsGrid}>
              <StatBox label="Total Users" value={stats.totalUsers.toLocaleString()} icon="👥" color="#4a90e2" />
              <StatBox label="Total URLs" value={stats.totalUrls.toLocaleString()} icon="🔗" color="#e94560" />
              <StatBox label="Total Clicks" value={stats.totalClicks.toLocaleString()} icon="📊" color="#7cb342" />
              <StatBox label="Active URLs" value={stats.activeUrls.toLocaleString()} icon="✅" color="#f0c040" />
            </div>
          ) : null}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Quick Links</h3>
            <div style={styles.linkGrid}>
              <a href="/api/docs" target="_blank" rel="noopener noreferrer" style={styles.adminLink}>📄 API Documentation</a>
              <a href="/health" target="_blank" rel="noopener noreferrer" style={styles.adminLink}>🏥 Health Check</a>
              <a href="/metrics" target="_blank" rel="noopener noreferrer" style={styles.adminLink}>📈 Prometheus Metrics</a>
            </div>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {tab === 'users' && (
        <div>
          <div style={styles.searchRow}>
            <input
              type="text"
              placeholder="Search users by email or username..."
              value={userSearch}
              onChange={e => { setUserSearch(e.target.value); setUserPage(1); }}
              style={styles.searchInput}
            />
            <span style={styles.countLabel}>{userTotal} users</span>
          </div>
          {loading ? <div style={styles.loading}>Loading...</div> : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>ID</th>
                    <th style={styles.th}>User</th>
                    <th style={styles.th}>Role</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>URLs</th>
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id} style={styles.tr}>
                      <td style={styles.td}>{user.id}</td>
                      <td style={styles.td}>
                        <div style={{ fontWeight: '600' }}>{user.username}</div>
                        <div style={{ color: '#888', fontSize: '0.8rem' }}>{user.email}</div>
                      </td>
                      <td style={styles.td}>
                        <span style={{ ...styles.roleBadge, background: user.role === 'ADMIN' ? '#f0c040' : '#e8f4fd', color: user.role === 'ADMIN' ? '#5a4000' : '#1a6fa3' }}>
                          {user.role}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={{ ...styles.statusBadge, background: user.isActive ? '#d4edda' : '#f8d7da', color: user.isActive ? '#155724' : '#721c24' }}>
                          {user.isActive ? 'Active' : 'Banned'}
                        </span>
                      </td>
                      <td style={{ ...styles.td, textAlign: 'center' }}>{user._count.urls}</td>
                      <td style={styles.td}>
                        <div style={styles.actions}>
                          <button onClick={() => handleToggleRole(user)} style={styles.actionBtn} title={user.role === 'ADMIN' ? 'Demote to User' : 'Promote to Admin'}>
                            {user.role === 'ADMIN' ? '⬇' : '⬆'}
                          </button>
                          <button onClick={() => handleToggleUserActive(user)} style={styles.actionBtn} title={user.isActive ? 'Ban User' : 'Unban User'}>
                            {user.isActive ? '🚫' : '✅'}
                          </button>
                          <button onClick={() => handleDeleteUser(user)} style={{ ...styles.actionBtn, color: '#e94560' }} title="Delete User">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={userPage} totalPages={userPages} onPage={setUserPage} />
        </div>
      )}

      {/* URLs Tab */}
      {tab === 'urls' && (
        <div>
          <div style={styles.searchRow}>
            <input
              type="text"
              placeholder="Search URLs..."
              value={urlSearch}
              onChange={e => { setUrlSearch(e.target.value); setUrlPage(1); }}
              style={styles.searchInput}
            />
            <span style={styles.countLabel}>{urlTotal} URLs</span>
          </div>
          {loading ? <div style={styles.loading}>Loading...</div> : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Short</th>
                    <th style={styles.th}>Long URL</th>
                    <th style={styles.th}>Owner</th>
                    <th style={styles.th}>Clicks</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {urls.map(url => (
                    <tr key={url.id} style={styles.tr}>
                      <td style={styles.td}>
                        <a href={`/${url.shortCode}`} target="_blank" rel="noopener noreferrer" style={{ color: '#e94560', fontWeight: '600', textDecoration: 'none' }}>
                          /{url.shortCode}
                        </a>
                      </td>
                      <td style={styles.td}><span title={url.longUrl}>{truncate(url.longUrl, 45)}</span></td>
                      <td style={styles.td}>{url.owner ? <span title={url.owner.email}>{url.owner.username}</span> : <span style={{ color: '#bbb' }}>Guest</span>}</td>
                      <td style={{ ...styles.td, textAlign: 'center', fontWeight: '600' }}>{String(url.clicks)}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.statusBadge, background: url.isActive ? '#d4edda' : '#f8d7da', color: url.isActive ? '#155724' : '#721c24' }}>
                          {url.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <button onClick={() => handleDeleteUrl(url.id, url.shortCode)} style={{ ...styles.actionBtn, color: '#e94560' }} title="Delete URL">🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={urlPage} totalPages={urlPages} onPage={setUrlPage} />
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <div style={{ ...styles.statBox, borderTop: `4px solid ${color}` }}>
      <div style={{ fontSize: '2rem' }}>{icon}</div>
      <div style={{ fontSize: '2rem', fontWeight: '800', color: '#1a1a2e' }}>{value}</div>
      <div style={{ color: '#888', fontSize: '0.9rem' }}>{label}</div>
    </div>
  );
}

function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div style={styles.pagination}>
      <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1} style={styles.pageBtn}>‹ Prev</button>
      <span style={{ color: '#666', fontSize: '0.9rem' }}>Page {page} of {totalPages}</span>
      <button onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} style={styles.pageBtn}>Next ›</button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: '1100px', margin: '0 auto', padding: '32px 20px' },
  title: { color: '#1a1a2e', margin: '0 0 4px 0', fontSize: '1.6rem', fontWeight: '800' },
  subtitle: { color: '#999', fontSize: '0.95rem', margin: '0 0 24px 0' },
  tabs: { display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '2px solid #eee', paddingBottom: '0' },
  tab: { padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.95rem', color: '#666', borderBottom: '2px solid transparent', marginBottom: '-2px', fontWeight: '600' },
  tabActive: { color: '#e94560', borderBottom: '2px solid #e94560' },
  error: { padding: '12px 16px', background: '#fff0f0', color: '#e94560', borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  errClose: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#e94560' },
  loading: { textAlign: 'center', padding: '40px', color: '#999' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' },
  statBox: { background: '#fff', borderRadius: '10px', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', textAlign: 'center' },
  card: { background: '#fff', borderRadius: '10px', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: '16px' },
  cardTitle: { color: '#1a1a2e', margin: '0 0 16px 0', fontSize: '1rem', fontWeight: '700' },
  linkGrid: { display: 'flex', gap: '12px', flexWrap: 'wrap' },
  adminLink: { padding: '10px 18px', background: '#f5f5f5', color: '#1a1a2e', borderRadius: '8px', textDecoration: 'none', fontWeight: '600', fontSize: '0.9rem' },
  searchRow: { display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' },
  searchInput: { flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e0e0e0', fontSize: '0.95rem', outline: 'none' },
  countLabel: { color: '#888', fontSize: '0.85rem', whiteSpace: 'nowrap' },
  tableWrap: { overflowX: 'auto', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.07)' },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', fontSize: '0.9rem' },
  th: { padding: '11px 14px', textAlign: 'left', color: '#555', fontWeight: '700', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '2px solid #eee', background: '#f8f9fa' },
  tr: { borderBottom: '1px solid #f5f5f5' },
  td: { padding: '10px 14px', verticalAlign: 'middle' },
  roleBadge: { padding: '3px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '700' },
  statusBadge: { padding: '3px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '700' },
  actions: { display: 'flex', gap: '6px' },
  actionBtn: { padding: '5px 7px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '1rem' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '20px' },
  pageBtn: { padding: '8px 16px', border: '1.5px solid #ddd', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' },
};
