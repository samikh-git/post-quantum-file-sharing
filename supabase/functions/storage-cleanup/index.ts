/**
 * Supabase Edge Function: delete Storage objects + `files` rows older than 24h.
 *
 * --- Dashboard editor ---
 * Function name: `storage-cleanup` (this file: `index.ts`).
 *
 * --- Secrets (Project → Edge Functions → Secrets) ---
 *   CRON_SECRET              random long string (you choose)
 *   SUPABASE_URL             usually auto-provided
 *   SUPABASE_SERVICE_ROLE_KEY usually auto-provided
 *
 * --- Disable JWT for schedulers ---
 * In `supabase/config.toml` (CLI) or function settings, set for this function:
 *   verify_jwt = false
 * so invocations are authorized only by `Authorization: Bearer <CRON_SECRET>`.
 *
 * --- Deploy (CLI) ---
 *   supabase functions deploy storage-cleanup
 *
 * --- Invoke (example) ---
 *   curl -sS -X POST "$SUPABASE_URL/functions/v1/storage-cleanup" \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json"
 *
 * Optional secrets:
 *   PURGE_MAX_AGE_HOURS — default 24
 *   PURGE_BATCH_LIMIT   — max rows per run (default 150)
 *
 * Retention:
 *   - `uploaded_at` set → purge when upload time is older than cutoff (confirmed uploads).
 *   - else → purge when `updated_at` is older than cutoff (stale PENDING).
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { createClient } from 'npm:@supabase/supabase-js@2'

const BUCKET = 'secure-drop-bucket'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

Deno.serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret?.trim()) {
    console.error('storage-cleanup: CRON_SECRET is not set')
    return json({ error: 'server_misconfigured' }, 500)
  }

  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (token !== cronSecret) {
    return json({ error: 'unauthorized' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'missing_supabase_env' }, 500)
  }

  const maxAgeH = Number(Deno.env.get('PURGE_MAX_AGE_HOURS') ?? '24')
  const batchLimit = Math.min(
    500,
    Math.max(1, Number(Deno.env.get('PURGE_BATCH_LIMIT') ?? '150'))
  )
  const hours = Number.isFinite(maxAgeH) && maxAgeH > 0 ? maxAgeH : 24
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: withUpload, error: e1 } = await admin
    .from('files')
    .select('id, s3_key')
    .not('uploaded_at', 'is', null)
    .lt('uploaded_at', cutoff)
    .limit(batchLimit)

  if (e1) {
    console.error('query uploaded_at:', e1)
    return json({ error: 'db_query_failed', detail: e1.message }, 500)
  }

  const remaining = Math.max(0, batchLimit - (withUpload?.length ?? 0))
  const { data: pendingOld, error: e2 } =
    remaining > 0
      ? await admin
          .from('files')
          .select('id, s3_key')
          .is('uploaded_at', null)
          .lt('updated_at', cutoff)
          .limit(remaining)
      : { data: [], error: null }

  if (e2) {
    console.error('query pending:', e2)
    return json({ error: 'db_query_failed', detail: e2.message }, 500)
  }

  const seen = new Set<string>()
  const rows: { id: string; s3_key: string }[] = []
  for (const r of [...(withUpload ?? []), ...(pendingOld ?? [])]) {
    if (!r?.id || !r?.s3_key || seen.has(r.id)) continue
    seen.add(r.id)
    rows.push({ id: r.id, s3_key: r.s3_key })
  }

  let storageRemoved = 0
  let dbDeleted = 0
  const errors: string[] = []

  for (const group of chunks(rows, 50)) {
    const paths = group.map((g) => g.s3_key)
    const { error: rmErr } = await admin.storage.from(BUCKET).remove(paths)
    if (rmErr) {
      errors.push(`storage.remove: ${rmErr.message}`)
      for (const row of group) {
        const { error: oneErr } = await admin.storage.from(BUCKET).remove([row.s3_key])
        if (oneErr) {
          errors.push(`storage.remove ${row.id}: ${oneErr.message}`)
          continue
        }
        storageRemoved += 1
        const { error: delErr } = await admin.from('files').delete().eq('id', row.id)
        if (delErr) errors.push(`files.delete ${row.id}: ${delErr.message}`)
        else dbDeleted += 1
      }
      continue
    }

    storageRemoved += group.length
    const ids = group.map((g) => g.id)
    const { error: delErr } = await admin.from('files').delete().in('id', ids)
    if (delErr) {
      errors.push(`files.delete batch: ${delErr.message}`)
      for (const row of group) {
        const { error: d1 } = await admin.from('files').delete().eq('id', row.id)
        if (!d1) dbDeleted += 1
      }
    } else {
      dbDeleted += ids.length
    }
  }

  return json({
    ok: true,
    cutoff,
    maxAgeHours: hours,
    candidates: rows.length,
    storageRemoved,
    dbDeleted,
    errors: errors.length ? errors.slice(0, 20) : undefined,
  })
})
