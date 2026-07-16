import React from 'react';

interface LoadingSkeletonProps {
  type?: 'table' | 'card' | 'text';
  rows?: number;
}

export function LoadingSkeleton({ type = 'text', rows = 5 }: LoadingSkeletonProps) {
  if (type === 'table') {
    return (
      <div style={styles.container}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={styles.row}>
            <div style={{ ...styles.bar, width: '15%' }} />
            <div style={{ ...styles.bar, width: '35%' }} />
            <div style={{ ...styles.bar, width: '8%' }} />
            <div style={{ ...styles.bar, width: '10%' }} />
            <div style={{ ...styles.bar, width: '12%' }} />
            <div style={{ ...styles.bar, width: '20%' }} />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'card') {
    return (
      <div style={styles.card}>
        <div style={{ ...styles.bar, width: '60%', height: '24px', marginBottom: '16px' }} />
        <div style={{ ...styles.bar, width: '100%', marginBottom: '8px' }} />
        <div style={{ ...styles.bar, width: '80%', marginBottom: '8px' }} />
        <div style={{ ...styles.bar, width: '45%' }} />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{ ...styles.bar, width: `${60 + Math.random() * 40}%`, marginBottom: '8px' }}
        />
      ))}
    </div>
  );
}

const pulse: React.CSSProperties = {
  animation: 'shimmer 1.5s ease-in-out infinite',
  background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
  backgroundSize: '200% 100%',
  borderRadius: '4px',
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px 0',
  },
  row: {
    display: 'flex',
    gap: '16px',
    padding: '12px 16px',
    borderBottom: '1px solid #eee',
  },
  bar: {
    ...pulse,
    height: '16px',
  },
  card: {
    padding: '24px',
    background: '#fff',
    borderRadius: '12px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
    marginBottom: '20px',
  },
};
