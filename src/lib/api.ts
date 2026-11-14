import { auth } from './firebase.ts';

export interface BackendHealthStatus {
  ok: boolean;
  wsEnabled: boolean;
}

export function getApiBaseUrl(): string {
  const configured =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
      ? String(import.meta.env.VITE_API_BASE_URL).trim().replace(/\/$/, '')
      : '';
  return configured;
}

export function isBackendServerExpected(): boolean {
  if (getApiBaseUrl()) return true;
  if (typeof window === 'undefined') return true;
  // Static Vercel preview/production builds serve only dist/ unless VITE_API_BASE_URL is configured
  return !window.location.hostname.endsWith('.vercel.app');
}

export function resolveApiUrl(path: string): string {
  const base = getApiBaseUrl();
  if (!base) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function getWebSocketUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const base = getApiBaseUrl();
  if (base) {
    try {
      const parsed = new URL(base);
      const proto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${parsed.host}/ws`;
    } catch {
      return null;
    }
  }
  if (!isBackendServerExpected()) return null;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

let cachedHealthPromise: Promise<BackendHealthStatus> | null = null;

export async function checkBackendHealth(forceRefresh = false): Promise<BackendHealthStatus> {
  if (!isBackendServerExpected()) {
    return { ok: false, wsEnabled: false };
  }
  if (cachedHealthPromise && !forceRefresh) {
    return cachedHealthPromise;
  }

  cachedHealthPromise = fetch(resolveApiUrl('/api/health'), {
    headers: { Accept: 'application/json' },
  })
    .then(async (res) => {
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('application/json')) {
        return { ok: false, wsEnabled: false };
      }
      const data = (await res.json().catch(() => null)) as { ok?: boolean; wsEnabled?: boolean } | null;
      return {
        ok: Boolean(data?.ok),
        wsEnabled: Boolean(data?.wsEnabled),
      };
    })
    .catch(() => ({ ok: false, wsEnabled: false }));

  return cachedHealthPromise;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (user) {
    try {
      const token = await user.getIdToken();
      headers.set('Authorization', `Bearer ${token}`);
    } catch {
      // Proceed without token; server will enforce auth if required
    }
  }

  const res = await fetch(resolveApiUrl(path), {
    ...options,
    headers,
  });

  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json().catch(() => ({})) : {};

  if (!res.ok) {
    if (res.status === 404 && !ct.includes('application/json')) {
      throw new Error(
        'Seriveri y\'ibikorwa (Backend API) ntabwo irimo gukora kuri uru rubuga (404). Koresha seriveri yuzuye cyangwa ushyireho VITE_API_BASE_URL.'
      );
    }
    throw new Error((data && data.error) || `Request failed with status ${res.status}`);
  }
  return data as T;
}
