import React, { useState, useCallback, useRef } from 'react';
import { createShortUrl } from '../api/urls';
import { QRCodeSVG } from './QRCode';

export function Home() {
  const [longUrl, setLongUrl] = useState('');
  const [customAlias, setCustomAlias] = useState('');
  const [title, setTitle] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [password, setPassword] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('');
  const [maxClicks, setMaxClicks] = useState('');
  const [isOneTime, setIsOneTime] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [shortUrl, setShortUrl] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(false);
  const [copied, setCopied] = useState(false);
  const createdRef = useRef(false);

  const resetResult = useCallback(() => {
    setCreated(false);
    createdRef.current = false;
    setShortUrl('');
    setShortCode('');
    setError('');
  }, []);

  const handleLongUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLongUrl(e.target.value);
    if (createdRef.current) resetResult();
  }, [resetResult]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setCreated(false);
    createdRef.current = false;
    try {
      const tags = tagsInput.trim() ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : undefined;
      const data = await createShortUrl({
        longUrl,
        customAlias: customAlias.trim() || undefined,
        title: title.trim() || undefined,
        tags,
        password: password.trim() || undefined,
        expiresInDays: expiresInDays ? parseInt(expiresInDays, 10) : undefined,
        maxClicks: maxClicks ? parseInt(maxClicks, 10) : undefined,
        isOneTime: isOneTime || undefined,
      });
      const baseUrl = window.location.origin;
      setShortUrl(data.shortUrl || `${baseUrl}/${data.shortCode}`);
      setShortCode(data.shortCode);
      setCreated(true);
      createdRef.current = true;
      setLongUrl('');
      setCustomAlias('');
      setTitle('');
      setTagsInput('');
      setPassword('');
      setExpiresInDays('');
      setMaxClicks('');
      setIsOneTime(false);
    } catch (err: any) {
      const errData = err.response?.data;
      if (errData?.details) {
        setError(errData.details.map((d: any) => d.message || d.path).join(', '));
      } else {
        setError(errData?.error || 'Failed to create short URL');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = useCallback(() => {
    setLongUrl(''); setCustomAlias(''); setShortUrl('');
    setShortCode(''); setError(''); setCreated(false);
    createdRef.current = false;
  }, []);

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shortUrl]);

  return (
    <div style={styles.container}>
      <div style={styles.hero}>
        <h1 style={styles.title}>Shorten. Share. Track.</h1>
        <p style={styles.subtitle}>Create short links with analytics, QR codes, and advanced controls</p>
      </div>

      <div style={styles.card}>
        <form onSubmit={handleSubmit}>
          <div style={styles.inputGroup}>
            <input
              type="url"
              placeholder="Paste your long URL here..."
              value={longUrl}
              onChange={handleLongUrlChange}
              required
              aria-label="Long URL"
              style={styles.input}
            />
          </div>
          <div style={styles.inputRow}>
            <input
              type="text"
              placeholder="Custom alias (optional)"
              value={customAlias}
              onChange={e => { setCustomAlias(e.target.value); if (createdRef.current) resetResult(); }}
              aria-label="Custom alias"
              style={{ ...styles.input, flex: 1 }}
            />
            <button
              type="button"
              onClick={() => setShowAdvanced(v => !v)}
              style={styles.advBtn}
            >
              {showAdvanced ? '▲ Less' : '▼ Options'}
            </button>
          </div>

          {showAdvanced && (
            <div style={styles.advanced}>
              <div style={styles.advRow}>
                <div style={styles.advField}>
                  <label style={styles.label}>Title</label>
                  <input type="text" placeholder="Link title" value={title} onChange={e => setTitle(e.target.value)} style={styles.input} />
                </div>
                <div style={styles.advField}>
                  <label style={styles.label}>Tags (comma-separated)</label>
                  <input type="text" placeholder="marketing, social" value={tagsInput} onChange={e => setTagsInput(e.target.value)} style={styles.input} />
                </div>
              </div>
              <div style={styles.advRow}>
                <div style={styles.advField}>
                  <label style={styles.label}>Expires in (days)</label>
                  <input type="number" placeholder="365" min="1" max="3650" value={expiresInDays} onChange={e => setExpiresInDays(e.target.value)} style={styles.input} />
                </div>
                <div style={styles.advField}>
                  <label style={styles.label}>Max clicks</label>
                  <input type="number" placeholder="Unlimited" min="1" value={maxClicks} onChange={e => setMaxClicks(e.target.value)} style={styles.input} />
                </div>
              </div>
              <div style={styles.advRow}>
                <div style={styles.advField}>
                  <label style={styles.label}>Password protection</label>
                  <input type="password" placeholder="Leave blank for none" value={password} onChange={e => setPassword(e.target.value)} style={styles.input} />
                </div>
                <div style={{ ...styles.advField, justifyContent: 'flex-end' }}>
                  <label style={{ ...styles.label, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={isOneTime} onChange={e => setIsOneTime(e.target.checked)} style={{ width: '16px', height: '16px' }} />
                    One-time link (deactivates after first click)
                  </label>
                </div>
              </div>
            </div>
          )}

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Shortening...' : 'Shorten URL'}
          </button>
        </form>
      </div>

      {shortUrl && created && (
        <div style={styles.result}>
          <h3 style={styles.resultTitle}>✅ Your short URL is ready!</h3>
          <div style={styles.urlBox}>
            <a href={shortUrl} target="_blank" rel="noopener noreferrer" style={styles.shortUrl}>
              {shortUrl}
            </a>
            <button onClick={copyToClipboard} style={styles.copyBtn}>
              {copied ? '✓ Copied!' : 'Copy'}
            </button>
          </div>
          <div style={styles.qrContainer}>
            <QRCodeSVG url={shortUrl} shortCode={shortCode} size={180} />
            <p style={styles.qrHint}>Scan QR code or click to visit</p>
          </div>
          <button onClick={handleReset} style={{ ...styles.button, marginTop: '16px', background: '#1a1a2e' }}>
            Shorten Another URL
          </button>
        </div>
      )}

      <div style={styles.features}>
        <div style={styles.feature}><span style={styles.featureIcon}>📊</span><strong>Analytics</strong><p>Track clicks, devices, and referrers</p></div>
        <div style={styles.feature}><span style={styles.featureIcon}>🔒</span><strong>Password Protection</strong><p>Secure links with a password</p></div>
        <div style={styles.feature}><span style={styles.featureIcon}>📱</span><strong>QR Codes</strong><p>Instant QR code for every link</p></div>
        <div style={styles.feature}><span style={styles.featureIcon}>⚡</span><strong>Fast Redirects</strong><p>Multi-layer caching for speed</p></div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: '760px', margin: '0 auto', padding: '40px 20px' },
  hero: { textAlign: 'center', marginBottom: '36px' },
  title: { fontSize: '2.4rem', fontWeight: '800', color: '#1a1a2e', margin: '0 0 10px 0', letterSpacing: '-1px' },
  subtitle: { fontSize: '1.1rem', color: '#666', margin: 0 },
  card: { background: '#fff', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', marginBottom: '24px' },
  inputGroup: { marginBottom: '12px' },
  inputRow: { display: 'flex', gap: '10px', marginBottom: '12px' },
  input: {
    width: '100%', padding: '13px 16px', fontSize: '1rem', borderRadius: '8px',
    border: '1.5px solid #e0e0e0', outline: 'none', transition: 'border-color 0.2s',
    boxSizing: 'border-box',
  },
  advBtn: {
    padding: '13px 16px', background: '#f5f5f5', color: '#555', border: '1.5px solid #e0e0e0',
    borderRadius: '8px', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '0.9rem',
  },
  advanced: { background: '#fafafa', borderRadius: '10px', padding: '16px', marginBottom: '12px', border: '1px solid #eee' },
  advRow: { display: 'flex', gap: '12px', marginBottom: '12px' },
  advField: { flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' },
  label: { fontSize: '0.8rem', color: '#888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' },
  button: {
    width: '100%', padding: '14px', fontSize: '1rem', fontWeight: '700',
    background: '#e94560', color: '#fff', border: 'none', borderRadius: '8px',
    cursor: 'pointer', marginTop: '4px',
  },
  error: {
    marginBottom: '12px', padding: '10px 14px', background: '#fff0f0',
    color: '#e94560', borderRadius: '8px', fontSize: '0.9rem',
  },
  result: {
    background: '#fff', borderRadius: '16px', padding: '32px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center', marginBottom: '32px',
  },
  resultTitle: { color: '#1a1a2e', marginBottom: '16px', fontSize: '1.1rem' },
  urlBox: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' },
  shortUrl: { fontSize: '1.3rem', color: '#e94560', fontWeight: '800', textDecoration: 'none', wordBreak: 'break-all' },
  copyBtn: {
    padding: '8px 18px', background: '#1a1a2e', color: '#fff',
    border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', whiteSpace: 'nowrap',
  },
  qrContainer: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' },
  qrHint: { color: '#999', fontSize: '0.8rem' },
  features: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginTop: '16px' },
  feature: {
    background: '#fff', borderRadius: '12px', padding: '20px', textAlign: 'center',
    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
  },
  featureIcon: { fontSize: '1.8rem', display: 'block', marginBottom: '8px' },
};
