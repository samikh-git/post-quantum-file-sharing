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
  if (explicit) {
    return explicit;
  }

  const set = new Set<string>();
  const frontend = process.env.FRONTEND_URL?.trim();
  if (frontend) {
    set.add(stripTrailingSlash(frontend));
  }

  if (process.env.NODE_ENV !== 'production') {
    for (const o of LOCAL_DEV_ORIGINS) {
      set.add(o);
    }
  }

  return set;
}

const allowedOrigins = buildAllowedOrigins();

if (
  process.env.NODE_ENV === 'production' &&
  allowedOrigins.size === 0 &&
  process.env.CORS_ALLOW_VERCEL_PREVIEWS !== '1'
) {
  console.warn(
    '[pqfs] CORS allowlist is empty — set FRONTEND_URL or CORS_ORIGINS on the API. Browser requests from your SPA will fail (often shown as "Failed to fetch").'
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
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
  maxAge: 86_400,
};
