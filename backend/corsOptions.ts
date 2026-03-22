import type { CorsOptions } from 'cors';

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

const LOCAL_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

function parseExplicitOrigins(): Set<string> | null {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) return null;
  const parts = raw
    .split(',')
    .map((s) => stripTrailingSlash(s.trim()))
    .filter(Boolean);
  return parts.length > 0 ? new Set(parts) : null;
}

function buildAllowedOrigins(): Set<string> {
  const explicit = parseExplicitOrigins();
  const set = explicit ? new Set(explicit) : new Set<string>();

  if (!explicit) {
    const frontend = process.env.FRONTEND_URL?.trim();
    if (frontend) {
      set.add(stripTrailingSlash(frontend));
    }
    if (process.env.NODE_ENV !== 'production') {
      for (const o of LOCAL_DEV_ORIGINS) {
        set.add(o);
      }
    }
  }

  // Vite default dev server — always allowed so local SPA can call prod/staging APIs when needed.
  set.add('http://localhost:5173');
  set.add('http://127.0.0.1:5173');

  return set;
}

const allowedOrigins = buildAllowedOrigins();

if (
  process.env.NODE_ENV === 'production' &&
  !process.env.FRONTEND_URL?.trim() &&
  !process.env.CORS_ORIGINS?.trim() &&
  process.env.CORS_ALLOW_VERCEL_PREVIEWS !== '1'
) {
  console.warn(
    '[pqfs] Production API has no FRONTEND_URL / CORS_ORIGINS — only Vite dev (localhost:5173) is allowed. Set FRONTEND_URL or CORS_ORIGINS for your deployed SPA.'
  );
}

function allowVercelPreview(origin: string): boolean {
  if (process.env.CORS_ALLOW_VERCEL_PREVIEWS !== '1') {
    return false;
  }
  try {
    const host = new URL(origin).hostname;
    return host === 'vercel.app' || host.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

/**
 * Reflects only listed origins (no wildcard). See backend README for `CORS_ORIGINS`,
 * `FRONTEND_URL`, and optional `CORS_ALLOW_VERCEL_PREVIEWS`.
 */
export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }
    const normalized = stripTrailingSlash(origin);
    if (allowedOrigins.has(normalized)) {
      callback(null, true);
      return;
    }
    if (allowVercelPreview(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
  maxAge: 86_400,
};
