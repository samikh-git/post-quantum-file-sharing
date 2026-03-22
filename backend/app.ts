import cors from 'cors';
import express, { Request, Response, Application, NextFunction } from 'express';
import { requireAuth } from './authMiddleware';
import * as sbUtils from './sb_utils';

const app: Application = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

type AsyncRoute = (req: Request, res: Response) => Promise<void>;

function asyncHandler(handler: AsyncRoute) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void handler(req, res).catch(next);
  };
}

app.get(
  '/me/boxes',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const username = await sbUtils.getUsernameByID(userId);
    const rows = await sbUtils.listBoxesForUser(userId);
    const frontend = process.env.FRONTEND_URL ?? '';
    const boxes = rows.map((b) => ({
      id: b.id,
      slug: b.slug,
      is_active: b.is_active,
      expires_at: b.expires_at,
      created_at: b.created_at,
      updated_at: b.updated_at,
      shareURL:
        username != null
          ? `${frontend}/drop/${encodeURIComponent(username)}/${encodeURIComponent(b.slug)}`
          : null,
    }));
    res.json({ username, boxes });
  })
);

app.get(
  '/me/boxes/:boxId/files',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { boxId } = req.params as { boxId: string };
    const ownerId = await sbUtils.getBoxOwnerUserId(boxId);
    if (!ownerId) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (ownerId !== req.userId) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    const files = await sbUtils.listFilesByBoxId(boxId);
    res.json({ files });
  })
);

/**
 * Owner-only: returns a short-lived storage URL plus per-file KEM metadata so the
 * browser can fetch ciphertext and decrypt locally.
 */
app.get(
  '/me/files/:fileId/download',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { fileId } = req.params as { fileId: string };
    const meta = await sbUtils.getFileDownloadMetaIfOwned(fileId, req.userId!);
    if (!meta) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (meta.status !== 'ACTIVE') {
      res.status(409).json({ error: 'not_ready' });
      return;
    }
    const signedUrl = await sbUtils.getDownloadSignedUrl(meta.s3_key);
    res.json({
      signedUrl,
      encrypted_name: meta.encrypted_name,
      nonce: meta.nonce,
      kem_ciphertext: meta.kem_ciphertext,
      content_type: meta.content_type,
    });
  })
);

app.get(
  '/boxes/check/:slug',
  asyncHandler(async (req, res) => {
    const { slug } = req.params as { slug: string };
    const isTaken = await sbUtils.chekSlugAvailability(slug);
    res.json({ isAvailable: !isTaken });
  })
);

app.post(
  '/boxes',
  asyncHandler(async (req, res) => {
    const { slug, publicKey, userId } = req.body as {
      slug: string;
      publicKey: string;
      userId: string;
    };
    const username = await sbUtils.getUsernameByID(userId);
    if (username == null) {
      res.status(409).json({ error: 'profile_missing' });
      return;
    }
    await sbUtils.createBox(slug, publicKey, userId);
    res.json({
      shareURL: `${process.env.FRONTEND_URL}/drop/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`,
    });
  })
);

app.get(
  '/boxes/:username/:slug',
  asyncHandler(async (req, res) => {
    const { username, slug } = req.params as { username: string; slug: string };
    const ownerId = await sbUtils.getUserIDByUsername(username);
    if (ownerId == null) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const box = await sbUtils.getBoxForSharedUpload(ownerId, slug);
    if (box == null) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json({
      publicKey: box.publicKey,
      boxId: box.boxId,
      ownerId,
    });
  })
);

app.post(
  '/boxes/:id/uploads',
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const {
      encryptedName,
      contentType,
      byteSizeBytes,
      s3Key,
      nonce,
      kemCiphertext,
    } = req.body as {
      encryptedName: string;
      contentType: string;
      byteSizeBytes: number;
      s3Key: string;
      nonce: string;
      kemCiphertext: string;
    };
    const fileId = await sbUtils.addFile(
      id,
      encryptedName,
      contentType,
      byteSizeBytes,
      s3Key,
      nonce,
      kemCiphertext
    );
    const uploadURL = await sbUtils.getUploadPresignedURL(s3Key);
    res.json({ uploadURL, fileId });
  })
);

app.patch(
  '/files/:id/confirm',
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    await sbUtils.confirmFile(id);
    res.json({ success: true });
  })
);

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'internal_server_error' });
});

export default app;
