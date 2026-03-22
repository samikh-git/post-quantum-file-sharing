import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import './App.css'
import {
  checkBoxSlugAvailability,
  confirmUploadedFile,
  createBox,
  fetchFileDownloadPrep,
  fetchMeBoxFiles,
  fetchMeBoxes,
  invalidateDashboardApiCache,
  type DashboardBox,
  type DashboardFile,
} from './lib/api'
import {
  decryptCiphertextWithLocalSecret,
  decryptEncryptedFilename,
  encodeMlkemPublicKeyBase64,
  ensureLocalMlkemKeyPair,
} from './lib/cryptoLocal'
import { isSupabaseConfigured, supabase } from './lib/supabase'

function normalizeSlugDraft(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function isValidSlug(s: string): boolean {
  if (s.length < 3 || s.length > 48) return false
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)
}

type SlugCheckState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'taken'
  | 'invalid'
  | 'check_failed'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function statusClass(status: string): string {
  if (status === 'ACTIVE') return 'dash-badge dash-badge--active'
  if (status === 'PENDING') return 'dash-badge dash-badge--pending'
  return 'dash-badge'
}

function safeDownloadFilename(name: string): string {
  const t = name.replace(/[/\\]/g, '_').trim()
  return t || 'download.bin'
}

function IconClipboard(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function IconCheck(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function IconArrowDown(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </svg>
  )
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.select()
  try {
    document.execCommand('copy')
  } finally {
    document.body.removeChild(ta)
  }
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [authMessage, setAuthMessage] = useState<string | null>(null)

  const [boxes, setBoxes] = useState<DashboardBox[] | null>(null)
  const [dashboardUsername, setDashboardUsername] = useState<string | null | undefined>(
    undefined
  )
  /** `idle` = no session; `loading` = fetching /me/boxes; `ready` = got JSON; `error` = fetch failed */
  const [meDashboardStatus, setMeDashboardStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle')
  const [boxesLoading, setBoxesLoading] = useState(false)
  const [selectedBoxId, setSelectedBoxId] = useState('')
  const [files, setFiles] = useState<DashboardFile[] | null>(null)
  const [filesLoading, setFilesLoading] = useState(false)
  const [decryptedFileNames, setDecryptedFileNames] = useState<Record<string, string>>({})
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null)
  const [confirmingFileId, setConfirmingFileId] = useState<string | null>(null)
  const [fileDownloadError, setFileDownloadError] = useState<string | null>(null)
  const [fileConfirmError, setFileConfirmError] = useState<string | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)

  const [keysStatus, setKeysStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [keysError, setKeysError] = useState<string | null>(null)

  const [newSlug, setNewSlug] = useState('')
  const [slugCheck, setSlugCheck] = useState<SlugCheckState>('idle')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState<string | null>(null)

  const [copiedUrlKey, setCopiedUrlKey] = useState<string | null>(null)
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasSupabase = isSupabaseConfigured

  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current) clearTimeout(copyFeedbackTimerRef.current)
    }
  }, [])

  function flashCopied(key: string) {
    if (copyFeedbackTimerRef.current) clearTimeout(copyFeedbackTimerRef.current)
    setCopiedUrlKey(key)
    copyFeedbackTimerRef.current = setTimeout(() => {
      setCopiedUrlKey(null)
      copyFeedbackTimerRef.current = null
    }, 2000)
  }

  async function copyShareUrl(key: string, url: string) {
    try {
      await copyTextToClipboard(url)
      flashCopied(key)
    } catch {
      /* clipboard denied or unavailable */
    }
  }

  useEffect(() => {
    if (!hasSupabase) {
      setSession(null)
      setAuthReady(true)
      return
    }
    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      setAuthReady(true)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => subscription.unsubscribe()
  }, [hasSupabase])

  useEffect(() => {
    setKeysStatus('loading')
    setKeysError(null)
    void ensureLocalMlkemKeyPair()
      .then(() => setKeysStatus('ready'))
      .catch((e: unknown) => {
        setKeysStatus('error')
        setKeysError(e instanceof Error ? e.message : String(e))
      })
  }, [])

  useEffect(() => {
    const token = session?.access_token
    if (!token) {
      invalidateDashboardApiCache()
      setBoxes(null)
      setDashboardUsername(undefined)
      setMeDashboardStatus('idle')
      return
    }
    let cancelled = false
    setBoxesLoading(true)
    setMeDashboardStatus('loading')
    setApiError(null)
    void fetchMeBoxes(token)
      .then(({ boxes: b, username }) => {
        if (!cancelled) {
          setBoxes(b)
          setDashboardUsername(username)
          setMeDashboardStatus('ready')
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setApiError(e instanceof Error ? e.message : String(e))
          setBoxes(null)
          setDashboardUsername(undefined)
          setMeDashboardStatus('error')
        }
      })
      .finally(() => {
        if (!cancelled) setBoxesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [session?.access_token])

  useEffect(() => {
    const normalized = normalizeSlugDraft(newSlug)
    if (!normalized) {
      setSlugCheck('idle')
      return undefined
    }
    if (!isValidSlug(normalized)) {
      setSlugCheck('invalid')
      return undefined
    }
    if (!dashboardUsername) {
      setSlugCheck('idle')
      return undefined
    }

    let cancelled = false
    setSlugCheck('checking')
    const t = window.setTimeout(() => {
      void checkBoxSlugAvailability(dashboardUsername, normalized)
        .then((available) => {
          if (cancelled) return
          setSlugCheck(available ? 'available' : 'taken')
        })
        .catch(() => {
          if (cancelled) return
          setSlugCheck('check_failed')
        })
    }, 520)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [newSlug, dashboardUsername])

  useEffect(() => {
    if (!boxes?.length) return
    setSelectedBoxId((prev) => {
      if (prev && boxes.some((b) => b.id === prev)) return prev
      return boxes[0].id
    })
  }, [boxes])

  useEffect(() => {
    const token = session?.access_token
    if (!token || !selectedBoxId) {
      setFiles(null)
      return
    }
    let cancelled = false
    setFilesLoading(true)
    setApiError(null)
    void fetchMeBoxFiles(token, selectedBoxId)
      .then((f) => {
        if (!cancelled) setFiles(f)
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setApiError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setFilesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [session?.access_token, selectedBoxId])

  useEffect(() => {
    if (!files?.length || keysStatus !== 'ready') {
      setDecryptedFileNames({})
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const { secretKey } = await ensureLocalMlkemKeyPair()
        const next: Record<string, string> = {}
        for (const f of files) {
          const name = await decryptEncryptedFilename(secretKey, f.encrypted_name)
          if (cancelled) return
          next[f.id] = name ?? 'Could not decrypt name'
        }
        if (!cancelled) setDecryptedFileNames(next)
      } catch {
        if (!cancelled) setDecryptedFileNames({})
      }
    })()
    return () => {
      cancelled = true
    }
  }, [files, keysStatus])

  async function handleSignIn(e: FormEvent) {
    e.preventDefault()
    if (!hasSupabase) return
    setAuthBusy(true)
    setAuthMessage(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setAuthBusy(false)
    if (error) setAuthMessage(error.message)
  }

  async function handleSignUp() {
    if (!hasSupabase) return
    setAuthBusy(true)
    setAuthMessage(null)
    const { error } = await supabase.auth.signUp({ email, password })
    setAuthBusy(false)
    if (error) setAuthMessage(error.message)
    else setAuthMessage('Check your email to confirm, or sign in if confirmations are off.')
  }

  async function handleSignOut() {
    invalidateDashboardApiCache()
    await supabase.auth.signOut()
    setBoxes(null)
    setFiles(null)
    setDecryptedFileNames({})
    setDownloadingFileId(null)
    setFileDownloadError(null)
    setSelectedBoxId('')
    setDashboardUsername(undefined)
    setMeDashboardStatus('idle')
    setNewSlug('')
    setSlugCheck('idle')
    setCreateError(null)
    setCreateSuccess(null)
    setCopiedUrlKey(null)
  }

  async function handleCreateLink(e: FormEvent) {
    e.preventDefault()
    if (!session?.user.id || !session.access_token) return
    const slug = normalizeSlugDraft(newSlug)
    if (!isValidSlug(slug) || slugCheck !== 'available') return
    if (keysStatus !== 'ready') return

    setCreateBusy(true)
    setCreateError(null)
    setCreateSuccess(null)
    try {
      const { publicKey } = await ensureLocalMlkemKeyPair()
      const publicKeyB64 = encodeMlkemPublicKeyBase64(publicKey)
      const { shareURL } = await createBox(session.access_token, {
        slug,
        publicKey: publicKeyB64,
      })
      setNewSlug('')
      setSlugCheck('idle')
      setCreateSuccess(shareURL)

      invalidateDashboardApiCache()
      const refreshed = await fetchMeBoxes(session.access_token)
      setBoxes(refreshed.boxes)
      setDashboardUsername(refreshed.username)
      const created = refreshed.boxes.find((b) => b.slug === slug)
      if (created) setSelectedBoxId(created.id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === 'profile_missing') {
        setCreateError(
          'No public.users profile for this account. Apply the Auth → users sync migration (backend README) or add the row in Supabase.'
        )
      } else {
        setCreateError(msg)
      }
    } finally {
      setCreateBusy(false)
    }
  }

  async function handleConfirmFile(f: DashboardFile) {
    if (!session?.access_token || !selectedBoxId) return
    setFileConfirmError(null)
    setConfirmingFileId(f.id)
    try {
      await confirmUploadedFile(session.access_token, f.id)
      invalidateDashboardApiCache()
      const refreshed = await fetchMeBoxFiles(session.access_token, selectedBoxId)
      setFiles(refreshed)
    } catch (e: unknown) {
      setFileConfirmError(e instanceof Error ? e.message : String(e))
    } finally {
      setConfirmingFileId(null)
    }
  }

  async function handleDownloadFile(f: DashboardFile) {
    if (!session?.access_token || keysStatus !== 'ready') return
    setFileDownloadError(null)
    setDownloadingFileId(f.id)
    try {
      const prep = await fetchFileDownloadPrep(session.access_token, f.id)
      const storageRes = await fetch(prep.signedUrl)
      if (!storageRes.ok) {
        throw new Error(`Storage fetch failed: ${storageRes.status} ${storageRes.statusText}`)
      }
      const ciphertext = new Uint8Array(await storageRes.arrayBuffer())
      const { secretKey } = await ensureLocalMlkemKeyPair()
      const plain = await decryptCiphertextWithLocalSecret(
        secretKey,
        prep.kem_ciphertext,
        prep.nonce,
        ciphertext
      )
      const filename =
        (await decryptEncryptedFilename(secretKey, prep.encrypted_name)) ??
        `file-${f.id}.bin`
      const blob = new Blob([new Uint8Array(plain)], {
        type: prep.content_type || 'application/octet-stream',
      })
      const a = document.createElement('a')
      const url = URL.createObjectURL(blob)
      a.href = url
      a.download = safeDownloadFilename(filename)
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: unknown) {
      setFileDownloadError(e instanceof Error ? e.message : String(e))
    } finally {
      setDownloadingFileId(null)
    }
  }

  const selectedBox = boxes?.find((b) => b.id === selectedBoxId)

  function shareUrlWithCopy(idKey: string, url: string) {
    const copied = copiedUrlKey === idKey
    return (
      <div className="dash-url-row">
        <code className="dash-url" title={url}>
          {url}
        </code>
        <button
          type="button"
          className="dash-copy-btn"
          onClick={(e) => {
            e.stopPropagation()
            void copyShareUrl(idKey, url)
          }}
          title={copied ? 'Copied' : 'Copy to clipboard'}
          aria-label={copied ? 'Link copied to clipboard' : 'Copy share link to clipboard'}
        >
          {copied ? (
            <IconCheck className="dash-copy-btn__icon dash-copy-btn__icon--ok" />
          ) : (
            <IconClipboard className="dash-copy-btn__icon" />
          )}
        </button>
      </div>
    )
  }

  const slugNorm = normalizeSlugDraft(newSlug)
  const slugValid = isValidSlug(slugNorm)
  const profileOk = dashboardUsername !== null && dashboardUsername !== undefined
  const dashboardOk = meDashboardStatus === 'ready'
  const createLinkDisabled =
    createBusy ||
    !dashboardOk ||
    !profileOk ||
    keysStatus !== 'ready' ||
    slugCheck !== 'available' ||
    !slugValid

  let createLinkTitle: string | undefined
  if (createBusy) createLinkTitle = 'Creating…'
  else if (meDashboardStatus === 'loading' || boxesLoading)
    createLinkTitle = 'Loading your account…'
  else if (meDashboardStatus === 'error')
    createLinkTitle = 'Fix the /me/boxes error above (API URL / backend running).'
  else if (dashboardUsername === null)
    createLinkTitle =
      'No public.users row for this account. Apply the Auth sync migration or insert a profile in Supabase.'
  else if (keysStatus !== 'ready')
    createLinkTitle =
      keysStatus === 'error' ? 'ML-KEM keys failed to load in this browser.' : 'Loading encryption keys…'
  else if (!slugValid)
    createLinkTitle = 'Enter a valid slug: 3–48 characters, letters, numbers, hyphens only.'
  else if (slugCheck === 'checking') createLinkTitle = 'Checking whether this slug is free…'
  else if (slugCheck === 'check_failed')
    createLinkTitle =
      'Could not reach the API to check the slug. Set VITE_API_URL or run the backend; check the Vite proxy.'
  else if (slugCheck === 'taken') createLinkTitle = 'This slug is already taken.'
  else if (slugCheck === 'idle' || slugCheck === 'invalid')
    createLinkTitle = 'Keep typing until the slug is valid; wait for the availability check.'

  return (
    <div className="dash">
      <header className="dash-header">
        <div className="dash-header-top">
          <div>
            <h1 className="dash-title">Drop links</h1>
            <p className="dash-sub">Shareable URLs and upload status</p>
          </div>
          <Link className="dash-about-link" to="/about">
            About
          </Link>
        </div>

        <div className="dash-keys">
          <strong>Local keys:</strong>{' '}
          {keysStatus === 'loading' && 'Preparing ML-KEM (IndexedDB)…'}
          {keysStatus === 'ready' && (
            <span className="dash-keys-ok">ML-KEM-768 key pair stored in IndexedDB</span>
          )}
          {keysStatus === 'error' && (
            <span className="dash-keys-err">Could not load WASM / keys: {keysError}</span>
          )}
        </div>

        {!hasSupabase && (
          <p className="dash-warn">
            Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to{' '}
            <code>.env</code> (see <code>.env.example</code>). Backend: run API on port{' '}
            <code>3001</code> or set <code>VITE_API_URL</code>.
          </p>
        )}

        {authReady && hasSupabase && (
          <div className="dash-auth">
            {session ? (
              <div className="dash-auth-row">
                <span className="dash-auth-user">
                  Signed in as <strong>{session.user.email ?? session.user.id}</strong>
                </span>
                <button type="button" className="dash-btn" onClick={() => void handleSignOut()}>
                  Sign out
                </button>
              </div>
            ) : (
              <form className="dash-auth-form" onSubmit={(e) => void handleSignIn(e)}>
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button type="submit" disabled={authBusy}>
                  Sign in
                </button>
                <button
                  type="button"
                  className="dash-btn-secondary"
                  disabled={authBusy}
                  onClick={() => void handleSignUp()}
                >
                  Sign up
                </button>
                {authMessage && <p className="dash-auth-msg">{authMessage}</p>}
              </form>
            )}
          </div>
        )}
      </header>

      {session && (
        <>
          {apiError && <p className="dash-api-err">API: {apiError}</p>}
          {dashboardUsername === null && (
            <p className="dash-hint dash-hint--warn">
              No <code className="dash-mono">public.users</code> profile for this Auth user. If you
              use the repo migration that syncs new signups, apply it (see backend README); otherwise
              insert a row whose <code className="dash-mono">id</code> matches your Auth user id.
            </p>
          )}

          <section className="dash-section">
            <h2 className="dash-h2">Create link</h2>
            <p className="dash-create-desc">
              Choose a URL slug for a new drop box. Uploaders will use your ML-KEM public key from
              this browser to encrypt files.
            </p>
            <form className="dash-create-form" onSubmit={(e) => void handleCreateLink(e)}>
              <div className="dash-create-row">
                <label className="dash-create-label" htmlFor="new-slug">
                  Slug
                </label>
                <input
                  id="new-slug"
                  className="dash-create-input"
                  type="text"
                  placeholder="e.g. client-drop-march"
                  value={newSlug}
                  onChange={(e) => {
                    setNewSlug(e.target.value)
                    setCreateSuccess(null)
                    setCreateError(null)
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={
                    createBusy ||
                    meDashboardStatus !== 'ready' ||
                    dashboardUsername === null
                  }
                />
                <button
                  type="submit"
                  className="dash-create-submit"
                  disabled={createLinkDisabled}
                  title={createLinkTitle}
                >
                  {createBusy ? 'Creating…' : 'Create link'}
                </button>
              </div>
              <p className="dash-create-meta" aria-live="polite">
                {(meDashboardStatus === 'loading' || boxesLoading) && 'Loading your account…'}
                {meDashboardStatus === 'error' &&
                  'Could not load your dashboard from the API. Check the red error above, VITE_API_URL, and that the backend is running.'}
                {keysStatus !== 'ready' && keysStatus !== 'error' && meDashboardStatus === 'ready' && (
                  <>Loading local keys…</>
                )}
                {keysStatus === 'error' && 'Fix ML-KEM keys before creating a link.'}
                {keysStatus === 'ready' &&
                  meDashboardStatus === 'ready' &&
                  dashboardUsername === null &&
                  'Profile missing — add public.users (see warning) before creating a link.'}
                {keysStatus === 'ready' &&
                  meDashboardStatus === 'ready' &&
                  dashboardUsername !== null &&
                  slugCheck === 'idle' &&
                  slugNorm === '' &&
                  '3–48 chars: letters, numbers, hyphens. Then wait for “available”.'}
                {keysStatus === 'ready' &&
                  meDashboardStatus === 'ready' &&
                  dashboardUsername !== null &&
                  slugCheck === 'invalid' &&
                  'Use 3–48 characters; only lowercase letters, numbers, and hyphens.'}
                {keysStatus === 'ready' &&
                  meDashboardStatus === 'ready' &&
                  dashboardUsername !== null &&
                  slugCheck === 'checking' &&
                  'Checking availability…'}
                {keysStatus === 'ready' &&
                  meDashboardStatus === 'ready' &&
                  dashboardUsername !== null &&
                  slugCheck === 'available' &&
                  'This slug is available — you can create the link.'}
                {keysStatus === 'ready' &&
                  meDashboardStatus === 'ready' &&
                  dashboardUsername !== null &&
                  slugCheck === 'taken' &&
                  'This slug is already taken.'}
                {keysStatus === 'ready' &&
                  meDashboardStatus === 'ready' &&
                  dashboardUsername !== null &&
                  slugCheck === 'check_failed' &&
                  'Could not check slug — browser could not reach GET /boxes/check/<username>/… (API URL / proxy / CORS).'}
              </p>
              {createError && <p className="dash-create-err">{createError}</p>}
              {createSuccess && (
                <p className="dash-create-ok">
                  <span className="dash-create-ok-label">Created. Share URL:</span>{' '}
                  {shareUrlWithCopy('create-success', createSuccess)}
                </p>
              )}
            </form>
          </section>

          <section className="dash-section">
            <h2 className="dash-h2">Your links</h2>
            {boxesLoading && <p className="dash-hint">Loading boxes…</p>}
            {!boxesLoading && boxes && boxes.length === 0 && (
              <p className="dash-empty">No drop links yet. Create one above.</p>
            )}
            {!boxesLoading && boxes && boxes.length > 0 && (
              <div className="dash-table-wrap">
                <table className="dash-table dash-table--boxes">
                  <thead>
                    <tr>
                      <th>Slug</th>
                      <th>Share URL</th>
                      <th>Active</th>
                      <th>Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boxes.map((box) => (
                      <tr
                        key={box.id}
                        className={
                          box.id === selectedBoxId ? 'dash-row dash-row--selected' : 'dash-row'
                        }
                        onClick={() => setSelectedBoxId(box.id)}
                      >
                        <td>
                          <button
                            type="button"
                            className="dash-slug"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedBoxId(box.id)
                            }}
                          >
                            {box.slug}
                          </button>
                        </td>
                        <td>
                          {box.shareURL ? (
                            <div className="dash-url-cell" onClick={(e) => e.stopPropagation()}>
                              {shareUrlWithCopy(`box-${box.id}`, box.shareURL)}
                            </div>
                          ) : (
                            <span className="dash-hint">—</span>
                          )}
                        </td>
                        <td>{box.is_active ? 'Yes' : 'No'}</td>
                        <td>
                          {box.expires_at ? new Date(box.expires_at).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {selectedBox && (
            <section className="dash-section">
              <h2 className="dash-h2">
                Uploads for <span className="dash-h2-slug">{selectedBox.slug}</span>
              </h2>
              {filesLoading && <p className="dash-hint">Loading files…</p>}
              {!filesLoading && files && files.length === 0 && (
                <p className="dash-empty">No files yet for this box.</p>
              )}
              {!filesLoading && files && files.length > 0 && (
                <div className="dash-table-wrap">
                  {fileDownloadError && (
                    <p className="dash-create-err" role="alert">
                      {fileDownloadError}
                    </p>
                  )}
                  {fileConfirmError && (
                    <p className="dash-create-err" role="alert">
                      {fileConfirmError}
                    </p>
                  )}
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Size</th>
                        <th>Created</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {files.map((f) => (
                        <tr key={f.id}>
                          <td>
                            <span className={statusClass(f.status)}>{f.status}</span>
                          </td>
                          <td>
                            <span className="dash-filename" title={f.encrypted_name}>
                              {decryptedFileNames[f.id] ?? '…'}
                            </span>
                          </td>
                          <td>{f.content_type}</td>
                          <td>{formatBytes(f.byte_size_bytes)}</td>
                          <td>{new Date(f.created_at).toLocaleString()}</td>
                          <td>
                            <div className="dash-file-actions">
                              {f.status === 'PENDING' && (
                                <button
                                  type="button"
                                  className="dash-finalize-btn"
                                  title={
                                    confirmingFileId === f.id
                                      ? 'Finalizing…'
                                      : 'Mark upload complete (after ciphertext is in storage)'
                                  }
                                  aria-busy={confirmingFileId === f.id}
                                  disabled={confirmingFileId === f.id}
                                  onClick={() => void handleConfirmFile(f)}
                                >
                                  {confirmingFileId === f.id ? '…' : 'Finalize'}
                                </button>
                              )}
                              <button
                                type="button"
                                className="dash-download-btn"
                                title={
                                  downloadingFileId === f.id ? 'Downloading…' : 'Download file'
                                }
                                aria-label={
                                  downloadingFileId === f.id
                                    ? 'Downloading file'
                                    : 'Download file'
                                }
                                aria-busy={downloadingFileId === f.id}
                                disabled={
                                  f.status !== 'ACTIVE' ||
                                  keysStatus !== 'ready' ||
                                  downloadingFileId === f.id
                                }
                                onClick={() => void handleDownloadFile(f)}
                              >
                                <IconArrowDown />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {!session && authReady && hasSupabase && (
        <p className="dash-hint dash-hint-center">Sign in to load your dashboard from the API.</p>
      )}
    </div>
  )
}

export default App
