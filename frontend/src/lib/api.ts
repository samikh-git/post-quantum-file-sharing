export type DashboardBox = {
  id: string
  slug: string
  is_active: boolean
  expires_at: string | null
  created_at: string
  updated_at: string
  /** Present when `public.users` has a row for this auth user; otherwise `null`. */
  shareURL: string | null
}

export type DashboardFile = {
  id: string
  encrypted_name: string
  content_type: string
  byte_size_bytes: number
  status: string
  created_at: string
  uploaded_at: string | null
  confirmed_at: string | null
}

function apiOrigin(): string {
  const raw = import.meta.env.VITE_API_URL
  return typeof raw === 'string' ? raw.replace(/\/$/, '') : ''
}

/**
 * Cross-origin API calls in production require `VITE_API_URL` at **build** time.
 * If it is missing, `fetch('/me/boxes')` hits the static host (Vercel) and fails or returns HTML.
 */
function url(path: string): string {
  const base = apiOrigin()
  if (import.meta.env.PROD && !base) {
    throw new Error(
      'VITE_API_URL was not set when this app was built. In Vercel: Settings → Environment Variables → add VITE_API_URL = your API base (e.g. https://xxx.up.railway.app), then redeploy.'
    )
  }
  return base ? `${base}${path}` : path
}

const NETWORK_ERROR_HINT_PROD =
  ' Check: VITE_API_URL points to your live API (https); API FRONTEND_URL / CORS allowlist matches this site origin; no http/https mix.'

const NETWORK_ERROR_HINT_DEV =
  ' Local dev: start the backend (default port 3001). With VITE_API_URL unset, Vite proxies /me and /boxes to http://localhost:3001. If .env sets VITE_API_URL, the browser calls that origin instead — ensure the API is up and allows this page’s origin (CORS), or remove VITE_API_URL to use the proxy.'

function networkErrorHint(): string {
  return import.meta.env.DEV ? NETWORK_ERROR_HINT_DEV : NETWORK_ERROR_HINT_PROD
}

/** `fetch` to our API — adds context when the browser reports a network/CORS failure. */
async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (
      msg === 'Failed to fetch' ||
      /network/i.test(msg) ||
      msg.includes('Load failed')
    ) {
      throw new Error(`${msg}.${networkErrorHint()}`)
    }
    throw e
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string }
    return j.error ?? res.statusText
  } catch {
    return res.statusText
  }
}

/** In-memory only (not http cookies). Clears on full page reload. */
const ME_BOXES_TTL_MS = 45_000
const BOX_FILES_TTL_MS = 35_000
const SLUG_CHECK_TTL_MS = 120_000
const SLUG_CACHE_MAX = 80

type Timed<T> = { value: T; expires: number }

const meBoxesCache = new Map<string, Timed<MeBoxesResponse>>()
const boxFilesCache = new Map<string, Timed<DashboardFile[]>>()
const slugCheckCache = new Map<string, Timed<boolean>>()

function filesCacheKey(accessToken: string, boxId: string): string {
  return `${accessToken}:${boxId}`
}

/** Drop cached dashboard API responses (call after sign-out or when data must be fresh). */
export function invalidateDashboardApiCache(): void {
  meBoxesCache.clear()
  boxFilesCache.clear()
  slugCheckCache.clear()
}

function pruneSlugCache(): void {
  if (slugCheckCache.size <= SLUG_CACHE_MAX) return
  const drop = slugCheckCache.size - SLUG_CACHE_MAX + 10
  const it = slugCheckCache.keys()
  for (let i = 0; i < drop; i++) {
    const k = it.next().value
    if (k !== undefined) slugCheckCache.delete(k)
  }
}

export type MeBoxesResponse = {
  username: string | null
  boxes: DashboardBox[]
}

export async function fetchMeBoxes(accessToken: string): Promise<MeBoxesResponse> {
  const now = Date.now()
  const hit = meBoxesCache.get(accessToken)
  if (hit && hit.expires > now) return hit.value

  const res = await apiFetch(url('/me/boxes'), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(await parseError(res))
  const body = (await res.json()) as MeBoxesResponse
  const value: MeBoxesResponse = {
    username: body.username ?? null,
    boxes: body.boxes ?? [],
  }
  meBoxesCache.set(accessToken, { value, expires: now + ME_BOXES_TTL_MS })
  return value
}

export async function updateMyUsername(accessToken: string, username: string): Promise<void> {
  const res = await apiFetch(url('/me/username'), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ username }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  invalidateDashboardApiCache()
}

export async function deleteMyAccount(accessToken: string): Promise<void> {
  const res = await apiFetch(url('/me/account'), {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ confirm: 'DELETE' }),
  })
  if (!res.ok) throw new Error(await parseError(res))
  invalidateDashboardApiCache()
}

export async function fetchMeBoxFiles(
  accessToken: string,
  boxId: string
): Promise<DashboardFile[]> {
  const now = Date.now()
  const key = filesCacheKey(accessToken, boxId)
  const hit = boxFilesCache.get(key)
  if (hit && hit.expires > now) return hit.value

  const res = await apiFetch(url(`/me/boxes/${encodeURIComponent(boxId)}/files`), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(await parseError(res))
  const body = (await res.json()) as { files: DashboardFile[] }
  const files = body.files ?? []
  boxFilesCache.set(key, { value: files, expires: now + BOX_FILES_TTL_MS })
  return files
}

function slugCheckCacheKey(username: string, slug: string): string {
  return `${username}:${slug}`
}

/** Slug is free for this `public.users.username` (pair matches share URL `/drop/:username/:slug`). */
export async function checkBoxSlugAvailability(
  username: string,
  slug: string
): Promise<boolean> {
  const now = Date.now()
  const key = slugCheckCacheKey(username, slug)
  const hit = slugCheckCache.get(key)
  if (hit && hit.expires > now) return hit.value

  const res = await apiFetch(
    url(
      `/boxes/check/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`
    ),
    { headers: { Accept: 'application/json' } }
  )
  if (!res.ok) throw new Error(await parseError(res))
  const body = (await res.json()) as { isAvailable?: boolean }
  const isAvailable = body.isAvailable === true
  slugCheckCache.set(key, { value: isAvailable, expires: now + SLUG_CHECK_TTL_MS })
  pruneSlugCache()
  return isAvailable
}

export type CreateBoxBody = {
  slug: string
  publicKey: string
}

export async function createBox(
  accessToken: string,
  body: CreateBoxBody
): Promise<{ shareURL: string }> {
  const res = await apiFetch(url('/boxes'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return (await res.json()) as { shareURL: string }
}

/** Public drop link: box crypto + ids for encrypted upload (no auth). */
export type DropBoxInfo = {
  publicKey: string
  boxId: string
  ownerId: string
}

export async function fetchDropBoxInfo(username: string, slug: string): Promise<DropBoxInfo> {
  const res = await fetch(
    url(`/boxes/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`),
    { headers: { Accept: 'application/json' } }
  )
  if (!res.ok) throw new Error(await parseError(res))
  return (await res.json()) as DropBoxInfo
}

export type RegisterUploadPayload = {
  encryptedName: string
  contentType: string
  byteSizeBytes: number
  s3Key: string
  nonce: string
  kemCiphertext: string
}

export async function registerFileUpload(
  boxId: string,
  payload: RegisterUploadPayload
): Promise<{ uploadURL: string; fileId: string }> {
  const res = await apiFetch(url(`/boxes/${encodeURIComponent(boxId)}/uploads`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await parseError(res))
  return (await res.json()) as { uploadURL: string; fileId: string }
}

/**
 * PUT ciphertext to the Supabase signed upload URL.
 * Must match {@link https://github.com/supabase/storage-js} `uploadToSignedUrl`:
 * multipart FormData with `cacheControl`, file part under `""`, and `x-upsert` header.
 */
export async function putCiphertextToSignedUrl(
  uploadURL: string,
  ciphertext: Uint8Array,
  contentType: string
): Promise<void> {
  const copy = new Uint8Array(ciphertext.byteLength)
  copy.set(ciphertext)
  const blob = new Blob([copy], { type: contentType })
  const form = new FormData()
  form.append('cacheControl', '3600')
  form.append('', blob)

  const res = await fetch(uploadURL, {
    method: 'PUT',
    body: form,
    headers: {
      'x-upsert': 'false',
    },
  })
  if (!res.ok) {
    let detail = ''
    try {
      const errBody = (await res.json()) as { message?: string; error?: string }
      detail = errBody.message ?? errBody.error ?? JSON.stringify(errBody)
    } catch {
      try {
        detail = await res.text()
      } catch {
        /* ignore */
      }
    }
    throw new Error(
      `Storage upload failed: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`
    )
  }
}

/** Box owner only: marks upload ACTIVE after ciphertext is in storage. */
export async function confirmUploadedFile(
  accessToken: string,
  fileId: string
): Promise<void> {
  const res = await apiFetch(url(`/files/${encodeURIComponent(fileId)}/confirm`), {
    method: 'PATCH',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) throw new Error(await parseError(res))
}

/** Response from `GET /me/files/:id/download` — ciphertext URL plus KEM fields for client decrypt. */
export type FileDownloadPrep = {
  signedUrl: string
  encrypted_name: string
  nonce: string
  kem_ciphertext: string
  content_type: string
}

export async function fetchFileDownloadPrep(
  accessToken: string,
  fileId: string
): Promise<FileDownloadPrep> {
  const res = await apiFetch(url(`/me/files/${encodeURIComponent(fileId)}/download`), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(await parseError(res))
  return (await res.json()) as FileDownloadPrep
}
