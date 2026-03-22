import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = raw !== undefined ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const windowMs = parsePositiveInt(process.env.UPLOAD_REGISTER_WINDOW_MS, 15 * 60 * 1000);

const skip = (): boolean =>
  process.env.RATE_LIMIT_DISABLED === '1' ||
  process.env.RATE_LIMIT_DISABLED === 'true';

/**
 * Limits `POST /boxes/:id/uploads` (register row + mint presigned upload URL).
 *
 * Env (optional):
 * - `UPLOAD_REGISTER_WINDOW_MS` — sliding window length (default 900000 = 15 min)
 * - `UPLOAD_REGISTER_MAX_PER_IP` — max registrations per IP per window (default 60)
 * - `UPLOAD_REGISTER_MAX_PER_BOX` — max per `boxes.id` per window, all IPs (default 200)
 * - `RATE_LIMIT_DISABLED=true` — turn off these limiters (local debugging only)
 * - `TRUST_PROXY=1` on `app` — set in `app.ts` so `req.ip` is correct behind a reverse proxy
 */
export const uploadRegisterIpLimiter = rateLimit({
  windowMs,
  max: parsePositiveInt(process.env.UPLOAD_REGISTER_MAX_PER_IP, 60),
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler: (_req, res) => {
    res.status(429).json({ error: 'rate_limited' });
  },
});

/** Caps abuse against a single drop link from distributed clients. */
export const uploadRegisterPerBoxLimiter = rateLimit({
  windowMs,
  max: parsePositiveInt(process.env.UPLOAD_REGISTER_MAX_PER_BOX, 200),
  standardHeaders: false,
  legacyHeaders: false,
  skip,
  keyGenerator: (req: Request) => {
    const id = req.params['id'];
    return typeof id === 'string' && id.length > 0 ? `box:${id}` : 'box:unknown';
  },
  handler: (_req, res) => {
    res.status(429).json({ error: 'rate_limited' });
  },
});
