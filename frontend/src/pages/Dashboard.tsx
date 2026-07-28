import React, { useEffect, useState, useCallback } from 'react';
import { getUserUrls, deleteUrl, ShortUrl, getQRUrl, updateUrl, exportUrlsCsv } from '../api/urls';
import { useNavigate } from 'react-router-dom';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { formatDate, truncate } from '../utils';

type SortKey = 'createdAt' | 'clicks' | 'expiresAt';
type StatusFilter = 'all' | 'active' | 'inactive';

export function Dashboard() {
  const [urls, setUrls] = useState<ShortUrl[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [exporting, setExporting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState('');
  const navigate = useNavigate();

  const fetchUrls = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getUserUrls(page, 20, search || undefined, statusFilter === 'all' ? undefined : statusFilter, sort, order);
      setUrls(data.urls);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        navigate('/login');
      } else {
        setError('Failed to load URLs');
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, sort, order, navigate]);

  useEffect(() => { fetchUrls(); }, [fetchUrls]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this URL? This action cannot be undone.')) return;
    setDeleting(id);
    try {
      await deleteUrl(id);
      fetchUrls();
    } catch {
      setError('Failed to delete URL');
    } finally {
      setDeleting(null);
    }
  };

  const handleToggleActive = async (url: ShortUrl) => {
    try {
      await updateUrl(url.id, { isActive: !url.isActive });
      fetchUrls();
    } catch {
      setError('Failed to update URL');
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportUrlsCsv();
    } catch {
      setError('Failed to export URLs');
    } finally {
      setExporting(false);
    }
  };

  const startEdit = (url: ShortUrl) => {
    setEditingId(url.id);
    setEditTitle(url.title || '');
    setEditTags(url.tags?.join(', ') || '');
  };

  const saveEdit = async (url: ShortUrl) => {
    try {
      const tags = editTags.split(',').map(t => t.trim()).filter(Boolean);
      await updateUrl(url.id, { title: editTitle, tags });
      setEditingId(null);
      fetchUrls();
    } catch {
      setError('Failed to save changes');
    }
  };

  const sortHeader = (key: SortKey, label: string) => (
    <th
      onClick={() => { if (sort === key) setOrder(o => o === 'asc' ? 'desc' : 'asc'); else { setSort(key); setOrder('desc'); } setPage(1); }}
      style={{ ...styles.th, cursor: 'pointer', userSelect: 'none' }}
    >
      {label} {sort === key ? (order === 'asc' ? '↑' : '↓') : ''}
    </th>
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>My URLs</h2>
          {!loading && <p style={styles.subtitle}>{total} link{total !== 1 ? 's' : ''} total</p>}
        </div>
        <div style={styles.headerActions}>
          <button onClick={handleExport} disabled={exporting} style={styles.exportBtn}>
            {exporting ? 'Exporting...' : '⬇ Export CSV'}
          </button>
          <button onClick={() => navigate('/')} style={styles.createBtn}>+ New Link</button>
        </div>
      </div>

      {/* Search & Filters */}
      <div style={styles.filters}>
        <form onSubmit={handleSearchSubmit} style={styles.searchForm}>
          <input
            type="text"
            placeholder="Search by URL, alias, or title..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            style={styles.searchInput}
          />
          <button type="submit" style={styles.searchBtn}>Search</button>
          {search && (
            <button type="button" onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }} style={styles.clearBtn}>
              Clear
            </button>
          )}
        </form>
        <div style={styles.filterGroup}>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value as StatusFilter); setPage(1); }} style={styles.select}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {loading ? (
        <LoadingSkeleton type="table" rows={5} />
      ) : urls.length === 0 ? (
        <div style={styles.empty}>
          <p style={{ fontSize: '3rem' }}>🔗</p>
          <p style={{ fontWeight: 'bold', color: '#1a1a2e' }}>{search ? 'No results found' : 'No URLs yet'}</p>
          <p style={{ color: '#999', marginBottom: '16px' }}>
            {search ? 'Try a different search term' : 'Create your first short link!'}
          </p>
          {!search && (
            <button onClick={() => navigate('/')} style={styles.createBtn}>Shorten your first URL</button>
          )}
        </div>
      ) : (
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.trHead}>
                <th style={styles.th}>Short URL</th>
                <th style={styles.th}>Long URL / Title</th>
                <th style={styles.th}>Tags</th>
                {sortHeader('clicks', 'Clicks')}
                <th style={styles.th}>Status</th>
                {sortHeader('createdAt', 'Created')}
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {urls.map((url) => (
                <tr key={url.id} style={{ ...styles.tr, opacity: deleting === url.id ? 0.5 : 1 }}>
                  <td style={styles.td}>
                    <a href={`/${url.shortCode}`} target="_blank" rel="noopener noreferrer" style={styles.shortLink}>
                      /{url.shortCode}
                    </a>
                    {url.isOneTime && <span style={styles.badge1T} title="One-time link">1×</span>}
                    {url.password && <span style={styles.badgeLock} title="Password protected">🔒</span>}
                  </td>
                  <td style={styles.td}>
                    {editingId === url.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Title" style={{ ...styles.searchInput, padding: '6px 10px', fontSize: '0.85rem' }} />
                        <input value={editTags} onChange={e => setEditTags(e.target.value)} placeholder="Tags (comma-separated)" style={{ ...styles.searchInput, padding: '6px 10px', fontSize: '0.85rem' }} />
                      </div>
                    ) : (
                      <>
                        <div style={{ fontWeight: url.title ? '600' : 'normal', color: '#333', fontSize: '0.9rem' }}>{url.title || ''}</div>
                        <div style={styles.longUrl} title={url.longUrl}>{truncate(url.longUrl, 50)}</div>
                      </>
                    )}
                  </td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {url.tags?.map(tag => <span key={tag} style={styles.tag}>{tag}</span>)}
                    </div>
                  </td>
                  <td style={{ ...styles.td, textAlign: 'center', fontWeight: '600' }}>
                    {typeof url.clicks === 'bigint' ? url.clicks.toString() : String(url.clicks)}
                  </td>
                  <td style={styles.td}>
                    <span style={{ ...styles.statusBadge, background: url.isActive ? '#d4edda' : '#f8d7da', color: url.isActive ? '#155724' : '#721c24' }}>
                      {url.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={styles.td}>{formatDate(url.createdAt)}</td>
                  <td style={styles.td}>
                    <div style={styles.actions}>
                      {editingId === url.id ? (
                        <>
                          <button onClick={() => saveEdit(url)} style={{ ...styles.actionBtn, color: '#155724' }} title="Save">✓</button>
                          <button onClick={() => setEditingId(null)} style={{ ...styles.actionBtn, color: '#721c24' }} title="Cancel">✕</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => navigate(`/analytics/${url.shortCode}`)} style={styles.actionBtn} title="Analytics">📊</button>
                          <a href={getQRUrl(url.shortCode)} download={`${url.shortCode}-qr.png`} style={styles.actionBtn} title="Download QR">📱</a>
                          <button onClick={() => startEdit(url)} style={styles.actionBtn} title="Edit">✏️</button>
                          <button onClick={() => handleToggleActive(url)} style={styles.actionBtn} title={url.isActive ? 'Deactivate' : 'Activate'}>
                            {url.isActive ? '⏸' : '▶'}
                          </button>
                          <button onClick={() => handleDelete(url.id)} style={{ ...styles.actionBtn, color: '#e94560' }} title="Delete" disabled={deleting === url.id}>🗑️</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div style={styles.pagination}>
          <button onClick={() => setPage(1)} disabled={page === 1} style={styles.pageBtn}>«</button>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={styles.pageBtn}>‹ Prev</button>
          <span style={styles.pageInfo}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={styles.pageBtn}>Next ›</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={styles.pageBtn}>»</button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: '1100px', margin: '0 auto', padding: '32px 20px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' },
  title: { color: '#1a1a2e', margin: 0, fontSize: '1.6rem', fontWeight: '800' },
  subtitle: { color: '#999', fontSize: '0.9rem', margin: '4px 0 0 0' },
  headerActions: { display: 'flex', gap: '10px', alignItems: 'center' },
  exportBtn: { padding: '10px 18px', background: '#fff', color: '#1a1a2e', border: '1.5px solid #ddd', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem' },
  createBtn: { padding: '10px 18px', background: '#e94560', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem' },
  filters: { display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' },
  searchForm: { display: 'flex', gap: '8px', flex: 1, minWidth: '260px' },
  searchInput: { flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e0e0e0', fontSize: '0.95rem', outline: 'none' },
  searchBtn: { padding: '10px 16px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' },
  clearBtn: { padding: '10px 14px', background: '#f5f5f5', color: '#666', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer' },
  filterGroup: { display: 'flex', gap: '8px' },
  select: { padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #e0e0e0', fontSize: '0.9rem', background: '#fff', cursor: 'pointer', outline: 'none' },
  error: { padding: '12px', background: '#fff0f0', color: '#e94560', borderRadius: '8px', marginBottom: '16px', textAlign: 'center' },
  empty: { textAlign: 'center', padding: '60px 20px', color: '#999', background: '#fff', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' },
  tableContainer: { overflowX: 'auto', borderRadius: '10px', boxShadow: '0 2px 14px rgba(0,0,0,0.08)' },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', fontSize: '0.9rem' },
  trHead: { background: '#f8f9fa' },
  tr: { borderBottom: '1px solid #f0f0f0', transition: 'background 0.15s' },
  th: { padding: '12px 14px', textAlign: 'left', color: '#555', fontWeight: '700', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '2px solid #eee' },
  td: { padding: '11px 14px', verticalAlign: 'middle' },
  shortLink: { color: '#e94560', fontWeight: '700', textDecoration: 'none' },
  longUrl: { color: '#888', fontSize: '0.8rem', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  statusBadge: { padding: '3px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '700' },
  tag: { background: '#e8f4fd', color: '#1a6fa3', borderRadius: '12px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: '600' },
  badge1T: { background: '#fff3cd', color: '#856404', borderRadius: '4px', padding: '1px 5px', fontSize: '0.7rem', marginLeft: '4px', fontWeight: '700' },
  badgeLock: { fontSize: '0.75rem', marginLeft: '4px' },
  actions: { display: 'flex', gap: '6px', alignItems: 'center' },
  actionBtn: { padding: '5px 7px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '1rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '24px' },
  pageBtn: { padding: '8px 14px', border: '1.5px solid #ddd', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600' },
  pageInfo: { color: '#666', fontSize: '0.9rem', padding: '0 8px' },
};
