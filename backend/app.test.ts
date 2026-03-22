import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('./sb_utils', () => ({
  chekSlugAvailability: vi.fn(),
  createBox: vi.fn(),
  deleteBox: vi.fn(),
  getBoxForSharedUpload: vi.fn(),
  addFile: vi.fn(),
  getUsernameByID: vi.fn(),
  updateUsernameForUser: vi.fn(),
  getUserIDByUsername: vi.fn(),
  getUploadPresignedURL: vi.fn(),
  getDownloadSignedUrl: vi.fn(),
  getFileDownloadMetaIfOwned: vi.fn(),
  confirmFile: vi.fn(),
  getBoxOwnerIdAndSlug: vi.fn(),
  confirmFileIfOwned: vi.fn(),
  verifyAccessToken: vi.fn(),
  listBoxesForUser: vi.fn(),
  getBoxOwnerUserId: vi.fn(),
  listFilesByBoxId: vi.fn(),
  deleteAccountForUser: vi.fn(),
}));

import * as sbUtils from './sb_utils';
import app from './app';

describe('PATCH /me/username', () => {
  beforeEach(() => {
    vi.mocked(sbUtils.verifyAccessToken).mockReset();
    vi.mocked(sbUtils.getUsernameByID).mockReset();
    vi.mocked(sbUtils.updateUsernameForUser).mockReset();
  });

  it('returns 401 without Authorization', async () => {
    const res = await request(app).patch('/me/username').send({ username: 'new-handle' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid username', async () => {
    vi.mocked(sbUtils.verifyAccessToken).mockResolvedValue('uid-1');

    const res = await request(app)
      .patch('/me/username')
      .set('Authorization', 'Bearer t')
      .send({ username: 'ab' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_username' });
  });

  it('returns 409 profile_missing when no public.users row', async () => {
    vi.mocked(sbUtils.verifyAccessToken).mockResolvedValue('uid-1');
    vi.mocked(sbUtils.getUsernameByID).mockResolvedValue(null);

    const res = await request(app)
      .patch('/me/username')
      .set('Authorization', 'Bearer t')
      .send({ username: 'valid-handle' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'profile_missing' });
    expect(sbUtils.updateUsernameForUser).not.toHaveBeenCalled();
  });

  it('returns 200 without update when username unchanged', async () => {
    vi.mocked(sbUtils.verifyAccessToken).mockResolvedValue('uid-1');
    vi.mocked(sbUtils.getUsernameByID).mockResolvedValue('alice');

    const res = await request(app)
      .patch('/me/username')
      .set('Authorization', 'Bearer t')
      .send({ username: 'alice' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: 'alice' });
    expect(sbUtils.updateUsernameForUser).not.toHaveBeenCalled();
  });

  it('returns 409 username_taken when update conflicts', async () => {
    vi.mocked(sbUtils.verifyAccessToken).mockResolvedValue('uid-1');
    vi.mocked(sbUtils.getUsernameByID).mockResolvedValue('alice');
    vi.mocked(sbUtils.updateUsernameForUser).mockResolvedValue('taken');

    const res = await request(app)
      .patch('/me/username')
      .set('Authorization', 'Bearer t')
      .send({ username: 'bob' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'username_taken' });
  });

  it('returns 200 when username updated', async () => {
    vi.mocked(sbUtils.verifyAccessToken).mockResolvedValue('uid-1');
    vi.mocked(sbUtils.getUsernameByID).mockResolvedValue('alice');
    vi.mocked(sbUtils.updateUsernameForUser).mockResolvedValue('updated');

    const res = await request(app)
      .patch('/me/username')
      .set('Authorization', 'Bearer t')
      .send({ username: 'new-handle' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: 'new-handle' });
    expect(sbUtils.updateUsernameForUser).toHaveBeenCalledWith('uid-1', 'new-handle');
  });
});

describe('DELETE /me/account', () => {
  beforeEach(() => {
    vi.mocked(sbUtils.verifyAccessToken).mockReset();
    vi.mocked(sbUtils.deleteAccountForUser).mockReset();
  });

  it('returns 401 without Authorization', async () => {
    const res = await request(app).delete('/me/account').send({ confirm: 'DELETE' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when confirm is not DELETE', async () => {
    vi.mocked(sbUtils.verifyAccessToken).mockResolvedValue('uid-1');

    const res = await request(app)
      .delete('/me/account')
      .set('Authorization', 'Bearer t')
      .send({ confirm: 'no' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'confirm_required' });
    expect(sbUtils.deleteAccountForUser).not.toHaveBeenCalled();
  });

  it('returns 204 and deletes when confirm is DELETE', async () => {
    vi.mocked(sbUtils.verifyAccessToken).mockResolvedValue('uid-1');
    vi.mocked(sbUtils.deleteAccountForUser).mockResolvedValue(undefined);

    const res = await request(app)
      .delete('/me/account')
      .set('Authorization', 'Bearer t')
      .send({ confirm: 'DELETE' });

    expect(res.status).toBe(204);
    expect(sbUtils.deleteAccountForUser).toHaveBeenCalledWith('uid-1');
  });

  it('returns 500 when delete throws', async () => {
    vi.mocked(sbUtils.verifyAccessToken).mockResolvedValue('uid-1');
    vi.mocked(sbUtils.deleteAccountForUser).mockRejectedValue(new Error('boom'));

    const res = await request(app)
      .delete('/me/account')
      .set('Authorization', 'Bearer t')
      .send({ confirm: 'DELETE' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'account_delete_failed' });
  });
});

describe('GET /me/boxes', () => {
  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://frontend.test';
    vi.mocked(sbUtils.verifyAccessToken).mockReset();
    vi.mocked(sbUtils.getUsernameByID).mockReset();
    vi.mocked(sbUtils.listBoxesForUser).mockReset();
  });

  it('returns 401 without Authorization', async () => {
    const res = await request(app).get('/me/boxes');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  it('returns 401 when token is invalid', async () => {
    vi.mocked(sbUtils.verifyAccessToken).mockResolvedValue(null);

    const res = await request(app)
      .get('/me/boxes')
      .set('Authorization', 'Bearer bad');

    expect(res.status).toBe(401);
  });

  it('returns boxes with shareURL when token is valid', async () => {
    vi.mocked(sbUtils.verifyAccessToken).mockResolvedValue('uid-dash');
    vi.mocked(sbUtils.getUsernameByID).mockResolvedValue('alice');
    vi.mocked(sbUtils.listBoxesForUser).mockResolvedValue([
      {
        id: 'b1',
        slug: 'drop-1',
        is_active: true,
        expires_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const res = await request(app)
      .get('/me/boxes')
      .set('Authorization', 'Bearer valid.jwt');

    expect(res.status).toBe(200);
    expect(res.body.username).toBe('alice');
    expect(res.body.boxes).toHaveLength(1);
    expect(res.body.boxes[0].shareURL).toBe(
      'https://frontend.test/drop/alice/drop-1'
    );
    expect(sbUtils.verifyAccessToken).toHaveBeenCalledWith('valid.jwt');
    expect(sbUtils.listBoxesForUser).toHaveBeenCalledWith('uid-dash');
  });

  it('returns null username and null shareURLs when public.users row is missing', async () => {
    vi.mocked(sbUtils.verifyAccessToken).mockResolvedValue('uid-dash');
    vi.mocked(sbUtils.getUsernameByID).mockResolvedValue(null);
    vi.mocked(sbUtils.listBoxesForUser).mockResolvedValue([
      {
        id: 'b1',
        slug: 'drop-1',
        is_active: true,
        expires_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const res = await request(app)
      .get('/me/boxes')
      .set('Authorization', 'Bearer valid.jwt');

    expect(res.status).toBe(200);
    expect(res.body.username).toBeNull();
    expect(res.body.boxes[0].shareURL).toBeNull();
  });
});

describe('GET /me/boxes/:boxId/files', () => {
  beforeEach(() => {
    vi.mocked(sbUtils.verifyAccessToken).mockReset();
    vi.mocked(sbUtils.getBoxOwnerUserId).mockReset();
    vi.mocked(sbUtils.listFilesByBoxId).mockReset();
  });

  it('returns 403 when the box belongs to another user', async () => {
    vi.mocked(sbUtils.verifyAccessToken).mockResolvedValue('me');
    vi.mocked(sbUtils.getBoxOwnerUserId).mockResolvedValue('other');

    const res = await request(app)
      .get('/me/boxes/box-uuid/files')
      .set('Authorization', 'Bearer t');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  it('returns 404 when the box does not exist', async () => {
    vi.mocked(sbUtils.verifyAccessToken).mockResolvedValue('me');
    vi.mocked(sbUtils.getBoxOwnerUserId).mockResolvedValue(null);

    const res = await request(app)
      .get('/me/boxes/missing/files')
      .set('Authorization', 'Bearer t');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  it('returns files when the caller owns the box', async () => {
    vi.mocked(sbUtils.verifyAccessToken).mockResolvedValue('owner-id');
    vi.mocked(sbUtils.getBoxOwnerUserId).mockResolvedValue('owner-id');
    vi.mocked(sbUtils.listFilesByBoxId).mockResolvedValue([
      {
        id: 'f1',
        encrypted_name: 'enc',
        content_type: 'application/octet-stream',
        byte_size_bytes: 10,
        status: 'PENDING',
        created_at: '2026-01-01T00:00:00.000Z',
        uploaded_at: null,
        confirmed_at: null,
      },
    ]);

    const res = await request(app)
      .get('/me/boxes/box-uuid/files')
      .set('Authorization', 'Bearer t');

    expect(res.status).toBe(200);
    expect(res.body.files).toHaveLength(1);
    expect(res.body.files[0].status).toBe('PENDING');
    expect(sbUtils.listFilesByBoxId).toHaveBeenCalledWith('box-uuid');
  });
});

describe('GET /me/files/:fileId/download', () => {
  beforeEach(() => {
    vi.mocked(sbUtils.verifyAccessToken).mockReset();
    vi.mocked(sbUtils.getFileDownloadMetaIfOwned).mockReset();
    vi.mocked(sbUtils.getDownloadSignedUrl).mockReset();
  });

  it('returns 401 without Authorization', async () => {
    const res = await request(app).get('/me/files/f1/download');
    expect(res.status).toBe(401);
  });

  it('returns 404 when file is missing or not owned', async () => {
    vi.mocked(sbUtils.verifyAccessToken).mockResolvedValue('me');
    vi.mocked(sbUtils.getFileDownloadMetaIfOwned).mockResolvedValue(null);

    const res = await request(app)
      .get('/me/files/missing/download')
      .set('Authorization', 'Bearer t');

    expect(res.status).toBe(404);
    expect(sbUtils.getFileDownloadMetaIfOwned).toHaveBeenCalledWith('missing', 'me');
  });

  it('returns 409 when file is not ACTIVE', async () => {
    vi.mocked(sbUtils.verifyAccessToken).mockResolvedValue('me');
    vi.mocked(sbUtils.getFileDownloadMetaIfOwned).mockResolvedValue({
      encrypted_name: '{}',
      nonce: 'n',
      kem_ciphertext: 'k',
      s3_key: 'path/obj',
      content_type: 'application/octet-stream',
      status: 'PENDING',
    });

    const res = await request(app)
      .get('/me/files/f-pending/download')
      .set('Authorization', 'Bearer t');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'not_ready' });
    expect(sbUtils.getDownloadSignedUrl).not.toHaveBeenCalled();
  });

  it('returns signedUrl and crypto fields when ACTIVE', async () => {
    vi.mocked(sbUtils.verifyAccessToken).mockResolvedValue('me');
    vi.mocked(sbUtils.getFileDownloadMetaIfOwned).mockResolvedValue({
      encrypted_name: '{"v":1}',
      nonce: 'nn',
      kem_ciphertext: 'kk',
      s3_key: 'u/box/file.bin',
      content_type: 'text/plain',
      status: 'ACTIVE',
    });
    vi.mocked(sbUtils.getDownloadSignedUrl).mockResolvedValue('https://storage.test/get?sig=1');

    const res = await request(app)
      .get('/me/files/f-active/download')
      .set('Authorization', 'Bearer t');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      signedUrl: 'https://storage.test/get?sig=1',
      encrypted_name: '{"v":1}',
      nonce: 'nn',
      kem_ciphertext: 'kk',
      content_type: 'text/plain',
    });
    expect(sbUtils.getDownloadSignedUrl).toHaveBeenCalledWith('u/box/file.bin');
  });
});

describe('GET /boxes/check/:username/:slug', () => {
  beforeEach(() => {
    vi.mocked(sbUtils.chekSlugAvailability).mockReset();
  });

  it('returns isAvailable true when slug is not taken for that user', async () => {
    vi.mocked(sbUtils.chekSlugAvailability).mockResolvedValue(false);

    const res = await request(app).get('/boxes/check/alice/free-slug');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ isAvailable: true });
    expect(sbUtils.chekSlugAvailability).toHaveBeenCalledWith('alice', 'free-slug');
  });

  it('returns isAvailable false when slug is taken for that user', async () => {
    vi.mocked(sbUtils.chekSlugAvailability).mockResolvedValue(true);

    const res = await request(app).get('/boxes/check/alice/taken-slug');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ isAvailable: false });
  });
});

describe('POST /boxes', () => {
  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://frontend.test';
    vi.mocked(sbUtils.createBox).mockReset();
    vi.mocked(sbUtils.getUsernameByID).mockReset();
    vi.mocked(sbUtils.verifyAccessToken).mockReset();
  });

  it('returns 401 without Authorization', async () => {
    const res = await request(app)
      .post('/boxes')
      .send({ slug: 'my-box', publicKey: 'pk-base64' });

    expect(res.status).toBe(401);
    expect(sbUtils.createBox).not.toHaveBeenCalled();
  });

  it('creates a box and returns shareURL with username and slug', async () => {
    vi.mocked(sbUtils.verifyAccessToken).mockResolvedValue('user-uuid-1');
    vi.mocked(sbUtils.getUsernameByID).mockResolvedValue('alice');

    const res = await request(app)
      .post('/boxes')
      .set('Authorization', 'Bearer valid.jwt')
      .send({
        slug: 'my-box',
        publicKey: 'pk-base64',
      });

    expect(res.status).toBe(200);
    expect(res.body.shareURL).toBe(
      'https://frontend.test/drop/alice/my-box'
    );
    expect(sbUtils.createBox).toHaveBeenCalledWith(
      'my-box',
      'pk-base64',
      'user-uuid-1'
    );
    expect(sbUtils.getUsernameByID).toHaveBeenCalledWith('user-uuid-1');
  });

  it('returns 409 when user has no public.users profile', async () => {
    vi.mocked(sbUtils.verifyAccessToken).mockResolvedValue('user-uuid-1');
    vi.mocked(sbUtils.getUsernameByID).mockResolvedValue(null);

    const res = await request(app)
      .post('/boxes')
      .set('Authorization', 'Bearer valid.jwt')
      .send({
        slug: 'my-box',
        publicKey: 'pk-base64',
      });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'profile_missing' });
    expect(sbUtils.createBox).not.toHaveBeenCalled();
  });

  it('returns 400 when slug is invalid', async () => {
    vi.mocked(sbUtils.verifyAccessToken).mockResolvedValue('user-uuid-1');

    const res = await request(app)
      .post('/boxes')
      .set('Authorization', 'Bearer valid.jwt')
      .send({
        slug: 'ab',
        publicKey: 'pk-base64',
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_slug' });
    expect(sbUtils.createBox).not.toHaveBeenCalled();
  });
});

describe('GET /boxes/:username/:slug', () => {
  beforeEach(() => {
    vi.mocked(sbUtils.getUserIDByUsername).mockReset();
    vi.mocked(sbUtils.getBoxForSharedUpload).mockReset();
  });

  it('resolves user by username then returns public key for that box', async () => {
    vi.mocked(sbUtils.getUserIDByUsername).mockResolvedValue('uid-42');
    vi.mocked(sbUtils.getBoxForSharedUpload).mockResolvedValue({
      boxId: 'box-uuid-99',
      publicKey: 'box-pk',
    });

    const res = await request(app).get('/boxes/alice/secret-drop');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      publicKey: 'box-pk',
      boxId: 'box-uuid-99',
      ownerId: 'uid-42',
    });
    expect(sbUtils.getUserIDByUsername).toHaveBeenCalledWith('alice');
    expect(sbUtils.getBoxForSharedUpload).toHaveBeenCalledWith('uid-42', 'secret-drop');
  });

  it('returns 404 when username does not exist', async () => {
    vi.mocked(sbUtils.getUserIDByUsername).mockResolvedValue(null);

    const res = await request(app).get('/boxes/nobody/secret-drop');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
    expect(sbUtils.getBoxForSharedUpload).not.toHaveBeenCalled();
  });

  it('returns 404 when box slug does not exist for user', async () => {
    vi.mocked(sbUtils.getUserIDByUsername).mockResolvedValue('uid-42');
    vi.mocked(sbUtils.getBoxForSharedUpload).mockResolvedValue(null);

    const res = await request(app).get('/boxes/alice/missing-slug');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });
});

describe('POST /boxes/:id/uploads', () => {
  const ownerId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const slug = 'my-slug';
  const leaf = '550e8400-e29b-41d4-a716-446655440000_obj.bin';
  const validS3Key = `${ownerId}/${slug}/${leaf}`;

  beforeEach(() => {
    vi.mocked(sbUtils.addFile).mockReset();
    vi.mocked(sbUtils.getUploadPresignedURL).mockReset();
    vi.mocked(sbUtils.getBoxOwnerIdAndSlug).mockReset();
  });

  it('registers file metadata and returns a string upload URL (not a Promise)', async () => {
    vi.mocked(sbUtils.getBoxOwnerIdAndSlug).mockResolvedValue({ ownerId, slug });
    vi.mocked(sbUtils.addFile).mockResolvedValue('new-file-id');
    vi.mocked(sbUtils.getUploadPresignedURL).mockResolvedValue(
      'https://storage.test/upload?sig=1'
    );

    const body = {
      encryptedName: 'enc-name',
      contentType: 'application/octet-stream',
      byteSizeBytes: 1024,
      s3Key: validS3Key,
      nonce: 'n',
      kemCiphertext: 'kem',
    };

    const res = await request(app)
      .post('/boxes/box-uuid-9/uploads')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.uploadURL).toBe('https://storage.test/upload?sig=1');
    expect(res.body.fileId).toBe('new-file-id');
    expect(typeof res.body.uploadURL).toBe('string');
    expect(sbUtils.addFile).toHaveBeenCalledWith(
      'box-uuid-9',
      body.encryptedName,
      body.contentType,
      body.byteSizeBytes,
      body.s3Key,
      body.nonce,
      body.kemCiphertext
    );
    expect(sbUtils.getUploadPresignedURL).toHaveBeenCalledWith(body.s3Key);
  });

  it('returns 404 when the box id does not exist', async () => {
    vi.mocked(sbUtils.getBoxOwnerIdAndSlug).mockResolvedValue(null);

    const res = await request(app)
      .post('/boxes/missing-box/uploads')
      .send({
        encryptedName: 'enc-name',
        contentType: 'application/octet-stream',
        byteSizeBytes: 1024,
        s3Key: validS3Key,
        nonce: 'n',
        kemCiphertext: 'kem',
      });

    expect(res.status).toBe(404);
    expect(sbUtils.addFile).not.toHaveBeenCalled();
  });

  it('returns 400 when s3Key does not match owner/slug/leaf rules', async () => {
    vi.mocked(sbUtils.getBoxOwnerIdAndSlug).mockResolvedValue({ ownerId, slug });

    const res = await request(app)
      .post('/boxes/box-uuid-9/uploads')
      .send({
        encryptedName: 'enc-name',
        contentType: 'application/octet-stream',
        byteSizeBytes: 1024,
        s3Key: 'wrong/path/550e8400-e29b-41d4-a716-446655440000_x.bin',
        nonce: 'n',
        kemCiphertext: 'kem',
      });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_s3_key' });
    expect(sbUtils.addFile).not.toHaveBeenCalled();
  });
});

describe('PATCH /files/:id/confirm', () => {
  beforeEach(() => {
    vi.mocked(sbUtils.confirmFileIfOwned).mockReset();
    vi.mocked(sbUtils.verifyAccessToken).mockReset();
  });

  it('returns 401 without Authorization', async () => {
    const res = await request(app).patch('/files/file-uuid-7/confirm');

    expect(res.status).toBe(401);
    expect(sbUtils.confirmFileIfOwned).not.toHaveBeenCalled();
  });

  it('returns 404 when the file is missing or not owned by the caller', async () => {
    vi.mocked(sbUtils.verifyAccessToken).mockResolvedValue('me');
    vi.mocked(sbUtils.confirmFileIfOwned).mockResolvedValue(false);

    const res = await request(app)
      .patch('/files/file-uuid-7/confirm')
      .set('Authorization', 'Bearer t');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
    expect(sbUtils.confirmFileIfOwned).toHaveBeenCalledWith('file-uuid-7', 'me');
  });

  it('confirms the file and returns success when owned', async () => {
    vi.mocked(sbUtils.verifyAccessToken).mockResolvedValue('me');
    vi.mocked(sbUtils.confirmFileIfOwned).mockResolvedValue(true);

    const res = await request(app)
      .patch('/files/file-uuid-7/confirm')
      .set('Authorization', 'Bearer t');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(sbUtils.confirmFileIfOwned).toHaveBeenCalledWith('file-uuid-7', 'me');
  });
});

describe('error handling', () => {
  it('returns 500 when a handler rejects', async () => {
    vi.mocked(sbUtils.chekSlugAvailability).mockRejectedValue(
      new Error('db down')
    );

    const res = await request(app).get('/boxes/check/u/x');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'internal_server_error' });
  });
});
