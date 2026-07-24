import React, { useEffect, useState } from 'react';
import { getUserUrls, deleteUrl, ShortUrl, getQRUrl, updateUrl } from '../api/urls';
import { useNavigate } from 'react-router-dom';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { formatDate, truncate } from '../utils';

export function Dashboard() {
  const [urls, setUrls] = useState<ShortUrl[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);
  const navigate = useNavigate();

  const fetchUrls = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getUserUrls(page);
      setUrls(data.urls);
      setTotalPages(data.totalPages);
    } catch {
      navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUrls();
  }, [page, navigate]);

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

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>My URLs</h2>

      {error && <div style={styles.error}>{error}</div>}

      {loading ? (
        <LoadingSkeleton type="table" rows={5} />
      ) : urls.length === 0 ? (
        <div style={styles.empty}>
          <p>No URLs yet.</p>
          <button onClick={() => navigate('/')} style={styles.createBtn}>
            Shorten your first URL
          </button>
        </div>
      ) : (
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th>Short URL</th>
                <th>Long URL</th>
                <th>Clicks</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {urls.map((url) => (
                <tr key={url.id} style={deleting === url.id ? { opacity: 0.5 } : {}}>
                  <td>
                    <a href={`/${url.shortCode}`} target="_blank" rel="noopener noreferrer" style={styles.shortLink}>
                      /{url.shortCode}
                    </a>
                  </td>
                  <td style={styles.longUrl} title={url.longUrl}>
                    {truncate(url.longUrl, 50)}
                  </td>
                  <td>{url.clicks}</td>
                  <td>
                    <span style={{
                      ...styles.badge,
                      background: url.isActive ? '#d4edda' : '#f8d7da',
                      color: url.isActive ? '#155724' : '#721c24',
                    }}>
                      {url.isActive ? 'Active' : 'Expired'}
                    </span>
                  </td>
                  <td>{formatDate(url.createdAt)}</td>
                  <td>
                    <div style={styles.actions}>
                      <button
                        onClick={() => navigate(`/analytics/${url.shortCode}`)}
                        style={styles.actionBtn}
                        title="Analytics"
                      >
                        📊
                      </button>
                      <a
                        href={getQRUrl(url.shortCode)}
                        download={`${url.shortCode}-qr.png`}
                        style={styles.actionBtn}
                        title="Download QR"
                      >
                        📱
                      </a>
                      <button
                        onClick={() => handleToggleActive(url)}
                        style={styles.actionBtn}
                        title={url.isActive ? 'Deactivate' : 'Activate'}
                      >
                        {url.isActive ? '🔴' : '🟢'}
                      </button>
                      <button
                        onClick={() => handleDelete(url.id)}
                        style={{ ...styles.actionBtn, color: '#e94560' }}
                        title="Delete"
                        disabled={deleting === url.id}
                      >
                        🗑️
                      </button>
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
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={styles.pageBtn}
          >
            Previous
          </button>
          <span style={styles.pageInfo}>Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={styles.pageBtn}
          >
            Next
          </button>
        </div>
      )}
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
    marginBottom: '16px',
    textAlign: 'center',
  },
  empty: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#999',
    background: '#fff',
    borderRadius: '12px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
  },
  createBtn: {
    marginTop: '16px',
    padding: '12px 24px',
    background: '#e94560',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '1rem',
  },
  tableContainer: {
    overflowX: 'auto',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    background: '#fff',
  },
  shortLink: {
    color: '#e94560',
    fontWeight: 'bold',
    textDecoration: 'none',
  },
  longUrl: {
    maxWidth: '250px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  badge: {
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '0.8rem',
    fontWeight: 'bold',
  },
  actions: {
    display: 'flex',
    gap: '8px',
  },
  actionBtn: {
    padding: '4px 8px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: '1.1rem',
    textDecoration: 'none',
  },
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '16px',
    marginTop: '24px',
  },
  pageBtn: {
    padding: '8px 20px',
    border: '1px solid #ddd',
    background: '#fff',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  pageInfo: {
    color: '#666',
    fontSize: '0.9rem',
  },
};
