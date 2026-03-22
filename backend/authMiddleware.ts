import { Request, Response, NextFunction } from 'express';
import * as sbUtils from './sb_utils';

/**
 * Requires `Authorization: Bearer <Supabase access token>`.
 * Sets `req.userId` to the Auth user UUID on success.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const token = authHeader.slice(7).trim();
    if (!token) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const userId = await sbUtils.verifyAccessToken(token);
    if (!userId) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    req.userId = userId;
    next();
  })().catch(next);
}
