import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function getServiceClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export type SeededUser = { userId: string; username: string };

/** Strong enough for typical Supabase Auth password rules. */
function randomPassword(): string {
  return `It-${randomUUID().replace(/-/g, '')}aA1!`;
}

/**
 * Creates a real `auth.users` row (required when `public.users.id` references
 * `auth.users`), then upserts `public.users` so tests can use `userId` like production.
 */
export async function seedTestUser(
  admin: SupabaseClient
): Promise<SeededUser> {
  const username = `it_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const email = `${username}@integration.test.invalid`;

  const { data: created, error: authError } =
    await admin.auth.admin.createUser({
      email,
      password: randomPassword(),
      email_confirm: true,
    });

  if (authError) throw authError;
  const userId = created.user?.id;
  if (!userId) {
    throw new Error('seedTestUser: auth.admin.createUser returned no user id');
  }

  const row = {
    id: userId,
    username,
    public_key: 'integration-test-user-pk',
  };

  const { error: profileError } = await admin
    .from('users')
    .upsert(row, { onConflict: 'id' });

  if (profileError) throw profileError;

  return { userId, username };
}

/**
 * Deletes boxes owned by the user (and cascaded files), then `public.users`,
 * then the Auth user — avoids FK errors if a test exited before `deleteBox`.
 */
export async function deleteUserCascade(
  admin: SupabaseClient,
  userId: string
): Promise<void> {
  const { error: boxesErr } = await admin
    .from('boxes')
    .delete()
    .eq('user_id', userId);
  if (boxesErr) throw boxesErr;

  const { error: profileErr } = await admin
    .from('users')
    .delete()
    .eq('id', userId);
  if (profileErr) throw profileErr;

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}

export async function getBoxIdBySlug(
  admin: SupabaseClient,
  slug: string
): Promise<string | null> {
  const { data, error } = await admin
    .from('boxes')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function getFileRowByS3Key(
  admin: SupabaseClient,
  s3Key: string
): Promise<{ id: string; status: string | null } | null> {
  const { data, error } = await admin
    .from('files')
    .select('id, status')
    .eq('s3_key', s3Key)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id as string, status: data.status as string | null };
}
