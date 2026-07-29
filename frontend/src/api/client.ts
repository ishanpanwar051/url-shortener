import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

let csrfToken: string | null = null;

async function fetchCsrfToken(): Promise<string> {
  const res = await axios.get(`${API_BASE}/csrf-token`, { withCredentials: true });
  csrfToken = res.data.csrfToken;
  return csrfToken!;
}

api.interceptors.request.use(async (config) => {
  const method = config.method?.toLowerCase() ?? '';
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    if (!csrfToken) {
      await fetchCsrfToken();
    }
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 403 &&
      error.response?.data?.error?.includes?.('CSRF') &&
      original &&
      !original._csrfRetry
    ) {
      original._csrfRetry = true;
      csrfToken = null;
      await fetchCsrfToken();
      original.headers['X-CSRF-Token'] = csrfToken;
      return api(original);
    }
    return Promise.reject(error);
  }
);

export default api;
