import React, { useState, useCallback, useRef } from 'react';
import { createShortUrl } from '../api/urls';
import { QRCodeSVG } from './QRCode';

export function Home() {
  const [longUrl, setLongUrl] = useState('');
  const [customAlias, setCustomAlias] = useState('');
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
    if (createdRef.current) {
      resetResult();
    }
  }, [resetResult]);

  const handleCustomAliasChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomAlias(e.target.value);
    if (createdRef.current) {
      resetResult();
    }
  }, [resetResult]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setCreated(false);
    createdRef.current = false;
    try {
      const data = await createShortUrl({
        longUrl,
        customAlias: customAlias || undefined,
      });
      const baseUrl = window.location.origin;
      setShortUrl(`${baseUrl}/${data.shortCode}`);
      setShortCode(data.shortCode);
      setCreated(true);
      createdRef.current = true;
      setLongUrl('');
      setCustomAlias('');
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
    setLongUrl('');
    setCustomAlias('');
    setShortUrl('');
    setShortCode('');
    setError('');
    setCreated(false);
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
        <h1 style={styles.title}>URL Shortener</h1>
        <p style={styles.subtitle}>Shorten, share, and track your links</p>
      </div>

      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          type="url"
          placeholder="Enter your long URL"
          value={longUrl}
          onChange={handleLongUrlChange}
          required
          aria-label="Long URL"
          style={styles.input}
        />
        <input
          type="text"
          placeholder="Custom alias (optional)"
          value={customAlias}
          onChange={handleCustomAliasChange}
          aria-label="Custom alias"
          style={styles.input}
        />
        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? 'Shortening...' : 'Shorten URL'}
        </button>
      </form>

      {error && <div style={styles.error}>{error}</div>}

      {shortUrl && created && (
        <div style={styles.result}>
          <h3>Your shortened URL:</h3>
          <div style={styles.urlBox}>
            <a href={shortUrl} target="_blank" rel="noopener noreferrer" style={styles.shortUrl}>
              {shortUrl}
            </a>
            <button onClick={copyToClipboard} style={styles.copyBtn}>{copied ? 'Copied!' : 'Copy'}</button>
          </div>
          <div style={styles.qrContainer}>
            <QRCodeSVG url={shortUrl} shortCode={shortCode} />
          </div>
          <button onClick={handleReset} style={{ ...styles.button, marginTop: '16px' }}>
            Shorten Another URL
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '700px',
    margin: '0 auto',
    padding: '40px 20px',
  },
  hero: {
    textAlign: 'center',
    marginBottom: '40px',
  },
  title: {
    fontSize: '2.5rem',
    color: '#e94560',
    margin: '0 0 10px 0',
  },
  subtitle: {
    fontSize: '1.2rem',
    color: '#666',
    margin: 0,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  input: {
    padding: '14px 16px',
    fontSize: '1rem',
    borderRadius: '8px',
    border: '1px solid #ddd',
    outline: 'none',
  },
  button: {
    padding: '14px',
    fontSize: '1rem',
    fontWeight: 'bold',
    background: '#e94560',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  error: {
    marginTop: '16px',
    padding: '12px',
    background: '#fff0f0',
    color: '#e94560',
    borderRadius: '8px',
    textAlign: 'center',
  },
  result: {
    marginTop: '32px',
    padding: '24px',
    background: '#f8f9fa',
    borderRadius: '8px',
    textAlign: 'center',
  },
  urlBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    marginTop: '12px',
  },
  shortUrl: {
    fontSize: '1.3rem',
    color: '#1a1a2e',
    fontWeight: 'bold',
    textDecoration: 'none',
  },
  copyBtn: {
    padding: '8px 16px',
    background: '#1a1a2e',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  qrContainer: {
    marginTop: '20px',
  },
};
