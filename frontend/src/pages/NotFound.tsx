import React from 'react';
import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.code}>404</div>
        <h1 style={styles.title}>Page Not Found</h1>
        <p style={styles.message}>The page you're looking for doesn't exist or has been moved.</p>
        <Link to="/" style={styles.btn}>← Back to Home</Link>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '70vh', padding: '20px',
  },
  card: {
    background: '#fff', borderRadius: '16px', padding: '60px 48px',
    textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    maxWidth: '420px', width: '100%',
  },
  code: { fontSize: '5rem', fontWeight: '900', color: '#e94560', lineHeight: 1, marginBottom: '8px' },
  title: { color: '#1a1a2e', fontSize: '1.5rem', margin: '0 0 12px 0' },
  message: { color: '#666', marginBottom: '28px', lineHeight: 1.6 },
  btn: {
    display: 'inline-block', padding: '12px 28px', background: '#e94560',
    color: '#fff', borderRadius: '8px', textDecoration: 'none', fontWeight: '700',
  },
};
