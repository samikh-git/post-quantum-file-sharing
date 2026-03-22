import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
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
} from '../lib/api'
import {
  decryptCiphertextWithLocalSecret,
  decryptEncryptedFilename,
  encodeMlkemPublicKeyBase64,
  ensureLocalMlkemKeyPair,
} from '../lib/cryptoLocal'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { isValidSlug, normalizeSlugDraft } from '../lib/slugHandle'
import { copyTextToClipboard, oauthRedirectBase } from './clipboard'
import type { SlugCheckState } from './types'
import { safeDownloadFilename } from './utils'

export function useDropDashboard() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [authMessage, setAuthMessage] = useState<string | null>(null)
  const [signUpUsername, setSignUpUsername] = useState('')

  const [boxes, setBoxes] = useState<DashboardBox[] | null>(null)
  const [dashboardUsername, setDashboardUsername] = useState<string | null | undefined>(
    undefined
  )
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
    const uid = session?.user?.id
    if (!uid) {
      setKeysStatus('idle')
      setKeysError(null)
      return
    }
    setKeysStatus('loading')
    setKeysError(null)
    void ensureLocalMlkemKeyPair(uid)
      .then(() => setKeysStatus('ready'))
      .catch((e: unknown) => {
        setKeysStatus('error')
        setKeysError(e instanceof Error ? e.message : String(e))
      })
  }, [session?.user?.id])

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
        if (!cancelled) setApiError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setFilesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [session?.access_token, selectedBoxId])

  useEffect(() => {
    const uid = session?.user?.id
    if (!files?.length || keysStatus !== 'ready' || !uid) {
      setDecryptedFileNames({})
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const { secretKey } = await ensureLocalMlkemKeyPair(uid)
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
  }, [files, keysStatus, session?.user?.id])

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
    const handle = normalizeSlugDraft(signUpUsername)
    if (!isValidSlug(handle)) {
      setAuthMessage(
        'Choose a public handle: 3–48 characters, lowercase letters, numbers, and hyphens only.'
      )
      return
    }
    setAuthBusy(true)
    setAuthMessage(null)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: handle } },
    })
    setAuthBusy(false)
    if (error) setAuthMessage(error.message)
    else setAuthMessage('Check your email to confirm, or sign in if confirmations are off.')
  }

  async function handleGoogleSignIn() {
    if (!hasSupabase) return
    setAuthBusy(true)
    setAuthMessage(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${oauthRedirectBase()}/`,
      },
    })
    if (error) {
      setAuthBusy(false)
      setAuthMessage(error.message)
    }
  }

  async function handleSignOut() {
    invalidateDashboardApiCache()
    setSignUpUsername('')
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
      const { publicKey } = await ensureLocalMlkemKeyPair(session.user.id)
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
      const { secretKey } = await ensureLocalMlkemKeyPair(session.user.id)
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

  function onNewSlugDraftChange(value: string) {
    setNewSlug(value)
    setCreateSuccess(null)
    setCreateError(null)
  }

  const selectedBox = boxes?.find((b) => b.id === selectedBoxId)

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
  else if (keysStatus === 'idle')
    createLinkTitle = 'Loading encryption keys for this account…'
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

  return {
    session,
    authReady,
    hasSupabase,
    email,
    setEmail,
    password,
    setPassword,
    authBusy,
    authMessage,
    signUpUsername,
    setSignUpUsername,
    handleSignIn,
    handleSignUp,
    handleGoogleSignIn,
    handleSignOut,
    keysStatus,
    keysError,
    boxes,
    dashboardUsername,
    meDashboardStatus,
    boxesLoading,
    apiError,
    selectedBoxId,
    setSelectedBoxId,
    files,
    filesLoading,
    decryptedFileNames,
    downloadingFileId,
    confirmingFileId,
    fileDownloadError,
    fileConfirmError,
    handleConfirmFile,
    handleDownloadFile,
    newSlug,
    onNewSlugDraftChange,
    slugCheck,
    createBusy,
    createError,
    createSuccess,
    handleCreateLink,
    copiedUrlKey,
    copyShareUrl,
    slugNorm,
    createLinkDisabled,
    createLinkTitle,
    selectedBox,
  }
}
