import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

interface NavbarProps {
  isAuthenticated: boolean;
  isAdmin?: boolean;
  username?: string;
  onLogout: () => void;
}

export function Navbar({ isAuthenticated, isAdmin, username, onLogout }: NavbarProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    setMenuOpen(false);
    await onLogout();
    navigate('/');
  };

  return (
    <nav style={styles.nav}>
      <Link to="/" style={styles.brand}>🔗 LinkShort</Link>
      <div style={styles.links}>
        {isAuthenticated ? (
          <>
            <Link to="/dashboard" style={styles.link}>Dashboard</Link>
            {isAdmin && <Link to="/admin" style={{ ...styles.link, color: '#f0c040' }}>Admin</Link>}
            <span style={styles.username}>@{username}</span>
            <button onClick={handleLogout} style={styles.button}>Logout</button>
          </>
        ) : (
          <>
            <Link to="/login" style={styles.link}>Login</Link>
            <Link to="/register" style={{ ...styles.button, textDecoration: 'none', display: 'inline-block', padding: '8px 16px' }}>
              Sign Up
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}

const styles: Record<string, React.CSSProperties> = {
  nav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 32px',
    background: '#1a1a2e',
    color: '#fff',
    boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
    position: 'sticky',
    top: 0,
    zIndex: 1000,
  },
  brand: {
    fontSize: '1.4rem',
    fontWeight: 'bold',
    color: '#e94560',
    textDecoration: 'none',
    letterSpacing: '-0.5px',
  },
  links: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
  },
  link: {
    color: '#ccc',
    textDecoration: 'none',
    fontSize: '0.95rem',
    transition: 'color 0.2s',
  },
  username: {
    color: '#888',
    fontSize: '0.85rem',
  },
  button: {
    padding: '8px 18px',
    background: '#e94560',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: '600',
  },
};
