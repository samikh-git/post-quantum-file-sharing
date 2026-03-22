/**
 * Exercise the `storage-cleanup` Edge Function with real Storage + `files` rows.
 *
 * Prereqs (backend `.env`):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CRON_SECRET                     — same value as Edge Function secret `CRON_SECRET`
 *
 * Optional:
 *   TEST_CLEANUP_BOX_ID            — `boxes.id` to attach the test file to (default: first box in DB)
 *
 * Usage (from `backend/`):
 *   npx tsx scripts/test-storage-cleanup.ts --smoke
 *       → POST the function only; expect `{ ok: true, candidates: N, ... }`
 *
 *   npx tsx scripts/test-storage-cleanup.ts --seed
 *       → 1) Pick a box (or TEST_CLEANUP_BOX_ID)
 *       → 2) Upload a tiny object to `secure-drop-bucket` under `cleanup-test/<uuid>.txt`
 *       → 3) Insert `files` row with `uploaded_at` = 48 hours ago (older than default 24h purge)
 *       → 4) POST `storage-cleanup` with Bearer CRON_SECRET
 *       → 5) Assert DB row + Storage object are gone
 *
 *   npx tsx scripts/test-storage-cleanup.ts --smoke --seed
 *       → run seed flow then smoke (same as --seed; smoke alone skips seed)
 */
import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

dotenv.config()

const BUCKET = 'secure-drop-bucket'
const FUNCTION_SLUG = 'storage-cleanup'

function mustEnv(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`Missing env ${name} (set in backend/.env)`)
  return v
}

async function invokeCleanup(
  baseUrl: string,
  cronSecret: string
): Promise<{ status: number; body: unknown }> {
  const url = `${baseUrl.replace(/\/$/, '')}/functions/v1/${FUNCTION_SLUG}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })
  let body: unknown
  try {
    body = await res.json()
  } catch {
    body = await res.text()
  }
  return { status: res.status, body }
}

async function main() {
  const smoke = process.argv.includes('--smoke')
  const seed = process.argv.includes('--seed')
  if (!smoke && !seed) {
    console.error('Pass --smoke and/or --seed (see file header).')
    process.exit(1)
  }

  const supabaseUrl = mustEnv('SUPABASE_URL')
  const serviceKey = mustEnv('SUPABASE_SERVICE_ROLE_KEY')
  const cronSecret = mustEnv('CRON_SECRET')

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  if (seed) {
    const boxId =
      process.env.TEST_CLEANUP_BOX_ID?.trim() ||
      (
        await admin.from('boxes').select('id').limit(1).maybeSingle()
      ).data?.id

    if (!boxId) {
      throw new Error(
        'No box found. Create a drop link from the app, or set TEST_CLEANUP_BOX_ID to a valid boxes.id UUID.'
      )
    }

    const fileId = randomUUID()
    const objectPath = `cleanup-test/${fileId}.txt`
    const payload = Buffer.from(
      `storage-cleanup test artifact\nfileId=${fileId}\nboxId=${boxId}\n`,
      'utf8'
    )

    const uploadedAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(objectPath, payload, { contentType: 'text/plain', upsert: true })

    if (upErr) {
      throw new Error(`Storage upload failed: ${upErr.message}`)
    }

    const { data: inserted, error: insErr } = await admin
      .from('files')
      .insert({
        id: fileId,
        box_id: boxId,
        encrypted_name: JSON.stringify({
          v: 1,
          n: 'AAAAAAAAAAAA',
          k: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          c: 'AAAAAAAA',
        }),
        content_type: 'text/plain',
        byte_size_bytes: payload.length,
        s3_key: objectPath,
        nonce: 'AAAAAAAAAAAA',
        kem_ciphertext: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        status: 'ACTIVE',
        uploaded_at: uploadedAt,
      })
      .select('id')
      .single()

    if (insErr) {
      await admin.storage.from(BUCKET).remove([objectPath])
      throw new Error(`files insert failed: ${insErr.message}`)
    }

    console.log('Seeded test artifact:', {
      fileId: inserted!.id,
      s3_key: objectPath,
      uploaded_at: uploadedAt,
      box_id: boxId,
    })

    const { status, body } = await invokeCleanup(supabaseUrl, cronSecret)
    console.log('Cleanup response:', status, JSON.stringify(body, null, 2))

    if (status !== 200) {
      await admin.storage.from(BUCKET).remove([objectPath])
      await admin.from('files').delete().eq('id', fileId)
      throw new Error(`Expected HTTP 200 from ${FUNCTION_SLUG}, got ${status}`)
    }

    const { data: rowAfter } = await admin.from('files').select('id').eq('id', fileId).maybeSingle()
    if (rowAfter) {
      throw new Error('Expected files row to be deleted after cleanup')
    }

    const { data: listed, error: listErr } = await admin.storage
      .from(BUCKET)
      .list('cleanup-test', { limit: 1000 })
    if (listErr) {
      throw new Error(`Storage list failed: ${listErr.message}`)
    }
    const stillThere = listed?.some((o) => o.name === `${fileId}.txt`)
    if (stillThere) {
      throw new Error('Expected Storage object to be removed after cleanup')
    }

    console.log('OK: expired test row and Storage object were purged.')
  }

  if (smoke && !seed) {
    const { status, body } = await invokeCleanup(supabaseUrl, cronSecret)
    console.log('Smoke test response:', status, JSON.stringify(body, null, 2))
    if (status !== 200) {
      process.exitCode = 1
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
