/**
 * Hits your live Supabase project (Postgres + Storage). Requires in `.env`:
 * - `SUPABASE_URL`
 * - `SUPABASE_SERVICE_ROLE_KEY` (same key `sb_utils` uses — Settings → API → service_role).
 *   Never expose this key in the browser or commit it.
 *
 * Seeding creates a real `auth.users` row first, then upserts `public.users`, so `userId`
 * satisfies a foreign key to `auth.users` when your schema uses that pattern.
 *
 * Run: `npm run test:integration`
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import * as sbUtils from './sb_utils';
import app from './app';
import {
  getServiceClient,
  seedTestUser,
  deleteUserCascade,
  getBoxIdBySlug,
  getFileRowByS3Key,
  type SeededUser,
} from './integration/db-helpers';

const admin = getServiceClient();

describe.skipIf(!admin)('Supabase integration (real DB)', () => {
  const service = admin!;
  let seeded: SeededUser | undefined;

  function seededUser(): SeededUser {
    if (!seeded) throw new Error('Test user not seeded (beforeAll failed)');
    return seeded;
  }

  beforeAll(async () => {
    seeded = await seedTestUser(service);
  });

  afterAll(async () => {
    if (!seeded) return;
    await deleteUserCascade(service, seeded.userId);
  });

  it('chekSlugAvailability is false for new slug, true after createBox, false after deleteBox', async () => {
    const u = seededUser();
    const slug = `it-slug-${randomUUID()}`;
    expect(await sbUtils.chekSlugAvailability(slug)).toBe(false);

    await sbUtils.createBox(slug, 'mlkem-pk-test', u.userId);
    expect(await sbUtils.chekSlugAvailability(slug)).toBe(true);

    await sbUtils.deleteBox(slug);
    expect(await sbUtils.chekSlugAvailability(slug)).toBe(false);
  });

  it('getUserIDByUsername and getKeyBySlug return the stored box public key', async () => {
    const u = seededUser();
    const slug = `it-box-${randomUUID()}`;
    const boxPk = 'recipient-pk-integration';

    expect(await sbUtils.getUserIDByUsername(u.username)).toBe(u.userId);

    await sbUtils.createBox(slug, boxPk, u.userId);
    const userId = await sbUtils.getUserIDByUsername(u.username);
    expect(await sbUtils.getKeyBySlug(userId, slug)).toBe(boxPk);

    await sbUtils.deleteBox(slug);
  });

  it('addFile then confirmFile moves status to ACTIVE', async () => {
    const u = seededUser();
    const slug = `it-file-${randomUUID()}`;
    const s3Key = `integration/${randomUUID()}/object.bin`;

    await sbUtils.createBox(slug, 'pk', u.userId);
    const boxId = await getBoxIdBySlug(service, slug);
    expect(boxId).not.toBeNull();

    await sbUtils.addFile(
      boxId!,
      'enc-name',
      'application/octet-stream',
      2048,
      s3Key,
      'nonce-b64',
      'kem-ct-b64'
    );

    const row = await getFileRowByS3Key(service, s3Key);
    expect(row).not.toBeNull();
    expect(row!.status).toBe('PENDING');

    await sbUtils.confirmFile(row!.id);
    const after = await getFileRowByS3Key(service, s3Key);
    expect(after?.status).toBe('ACTIVE');

    await sbUtils.deleteBox(slug);
  });

  it('POST /boxes creates a box and returns shareURL', async () => {
    const u = seededUser();
    const slug = `it-http-${randomUUID()}`;
    const frontend = process.env.FRONTEND_URL ?? 'http://localhost:3000';

    const res = await request(app)
      .post('/boxes')
      .send({
        slug,
        publicKey: 'http-test-pk',
        userId: u.userId,
      });

    expect(res.status).toBe(200);
    expect(res.body.shareURL).toBe(
      `${frontend}/drop/${encodeURIComponent(u.username)}/${encodeURIComponent(slug)}`
    );

    await sbUtils.deleteBox(slug);
  });

  it('GET /boxes/check/:slug matches DB state', async () => {
    const u = seededUser();
    const slug = `it-check-${randomUUID()}`;

    let res = await request(app).get(`/boxes/check/${slug}`);
    expect(res.status).toBe(200);
    expect(res.body.isAvailable).toBe(true);

    await sbUtils.createBox(slug, 'pk', u.userId);
    res = await request(app).get(`/boxes/check/${slug}`);
    expect(res.body.isAvailable).toBe(false);

    await sbUtils.deleteBox(slug);
  });

  it('GET /boxes/:username/:slug returns publicKey', async () => {
    const u = seededUser();
    const slug = `it-pub-${randomUUID()}`;
    const pk = 'wire-pk-test';

    await sbUtils.createBox(slug, pk, u.userId);

    const res = await request(app).get(
      `/boxes/${encodeURIComponent(u.username)}/${encodeURIComponent(slug)}`
    );

    expect(res.status).toBe(200);
    expect(res.body.publicKey).toBe(pk);
    expect(typeof res.body.boxId).toBe('string');
    expect(res.body.ownerId).toBe(u.userId);

    await sbUtils.deleteBox(slug);
  });

  it('POST /boxes/:id/uploads returns a string uploadURL', async () => {
    const u = seededUser();
    const slug = `it-up-${randomUUID()}`;
    const s3Key = `integration/${randomUUID()}/upload.bin`;

    await sbUtils.createBox(slug, 'pk', u.userId);
    const boxId = await getBoxIdBySlug(service, slug);

    const res = await request(app)
      .post(`/boxes/${boxId}/uploads`)
      .send({
        encryptedName: 'e',
        contentType: 'application/octet-stream',
        byteSizeBytes: 10,
        s3Key,
        nonce: 'n',
        kemCiphertext: 'k',
      });

    expect(res.status).toBe(200);
    expect(typeof res.body.uploadURL).toBe('string');
    expect(res.body.uploadURL).toMatch(/^https?:\/\//);
    expect(typeof res.body.fileId).toBe('string');

    await sbUtils.deleteBox(slug);
  });

  it('PATCH /files/:id/confirm succeeds', async () => {
    const u = seededUser();
    const slug = `it-confirm-${randomUUID()}`;
    const s3Key = `integration/${randomUUID()}/confirm.bin`;

    await sbUtils.createBox(slug, 'pk', u.userId);
    const boxId = await getBoxIdBySlug(service, slug);

    await sbUtils.addFile(
      boxId!,
      'e',
      'application/octet-stream',
      1,
      s3Key,
      'n',
      'k'
    );
    const row = await getFileRowByS3Key(service, s3Key);
    expect(row).not.toBeNull();

    const res = await request(app).patch(`/files/${row!.id}/confirm`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    await sbUtils.deleteBox(slug);
  });
});
