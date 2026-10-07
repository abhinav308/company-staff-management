import axios from 'axios';

const envApiUrl = import.meta.env.VITE_API_URL;
export const API_URL = (envApiUrl && (!envApiUrl.includes('localhost') || (typeof window !== 'undefined' && window.location.hostname === 'localhost')))
  ? envApiUrl
  : '/api';
const defaultWsProto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const defaultWsHost = typeof window !== 'undefined' && window.location.host ? window.location.host : 'localhost:8000';
export const WS_URL = import.meta.env.VITE_WS_URL || `${defaultWsProto}//${defaultWsHost}`;

export const tokens = {
  get access() { return localStorage.getItem('access'); },
  get refresh() { return localStorage.getItem('refresh'); },
  set(access: string, refresh?: string) {
    localStorage.setItem('access', access);
    if (refresh) localStorage.setItem('refresh', refresh);
  },
  clear() { localStorage.removeItem('access'); localStorage.removeItem('refresh'); },
};

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((c) => {
  if (tokens.access) c.headers.Authorization = `Bearer ${tokens.access}`;
  return c;
});

let refreshing: Promise<string> | null = null;

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const orig = err.config;
    const isAuthCall = orig?.url?.includes('/auth/');
    if (err.response?.status === 401 && !orig._retry && tokens.refresh && !isAuthCall) {
      orig._retry = true;
      refreshing ??= axios
        .post(`${API_URL}/auth/refresh/`, { refresh: tokens.refresh })
        .then((r) => { tokens.set(r.data.access, r.data.refresh); return r.data.access as string; })
        .finally(() => { refreshing = null; });
      try {
        orig.headers.Authorization = `Bearer ${await refreshing}`;
        return api(orig);
      } catch {
        tokens.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

export function errorMessage(e: unknown): string {
  const d = (e as { response?: { data?: unknown } })?.response?.data;
  if (typeof d === 'string') return d;
  if (d && typeof d === 'object') {
    const o = d as Record<string, unknown>;
    if (typeof o.detail === 'string') return o.detail;
    return Object.entries(o).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : String(v)}`).join('\n');
  }
  return e instanceof Error ? e.message : 'Something went wrong';
}

export default api;
