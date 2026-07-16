import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// No localStorage token management.
// Auth is handled via httpOnly cookies (automatic with withCredentials).
// For API clients, tokens can be set via Authorization header manually.

export default api;
