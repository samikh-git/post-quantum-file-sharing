import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Link, useNavigate } from 'react-router'
import {
  deleteMyAccount,
  fetchMeBoxes,
  invalidateDashboardApiCache,
  updateMyUsername,
} from '../lib/api'
import { isAutoAssignedUsername, isValidSlug, normalizeSlugDraft } from '../lib/slugHandle'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import './UploadPage.css'
import './UserPage.css'

export default function UserPage() {
  const navigate = useNavigate()
  const [authReady, setAuthReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)

  const [username, setUsername] = useState<string | null | undefined>(undefined)
  const [usernameDraft, setUsernameDraft] = useState('')
  const [usernameBusy, setUsernameBusy] = useState(false)
  const [usernameMessage, setUsernameMessage] = useState<string | null>(null)

  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null)

  const hasSupabase = isSupabaseConfigured

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
    const token = session?.access_token
    if (!token) {
      setUsername(undefined)
      setUsernameDraft('')
      return
    }
    let cancelled = false
    void fetchMeBoxes(token)
      .then(({ username: u }) => {
        if (!cancelled) {
          setUsername(u)
          if (typeof u === 'string') setUsernameDraft(u)
          else setUsernameDraft('')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUsername(null)
          setUsernameDraft('')
        }
      })
    return () => {
      cancelled = true
    }
  }, [session?.access_token])

  async function handleSaveUsername() {
    const token = session?.access_token
    if (!token) return
    const handle = normalizeSlugDraft(usernameDraft)
    if (!isValidSlug(handle)) {
      setUsernameMessage('Use 3–48 characters; only lowercase letters, numbers, hyphens.')
      return
    }
    if (handle === username) return
    setUsernameBusy(true)
    setUsernameMessage(null)
    try {
      await updateMyUsername(token, handle)
      const refreshed = await fetchMeBoxes(token)
      setUsername(refreshed.username)
      if (refreshed.username) setUsernameDraft(refreshed.username)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg === 'username_taken' || msg.includes('username_taken')) {
        setUsernameMessage('That handle is already taken. Try another.')
      } else if (msg === 'invalid_username' || msg.includes('invalid_username')) {
        setUsernameMessage('Invalid handle format.')
      } else if (msg.includes('profile_missing')) {
        setUsernameMessage('No profile row yet. Apply the Auth → users sync migration (backend README).')
      } else {
        setUsernameMessage(msg)
      }
    } finally {
      setUsernameBusy(false)
    }
  }

  async function handleDeleteAccount() {
    const token = session?.access_token
    if (!token) return
    if (deleteConfirm !== 'DELETE') {
      setDeleteMessage('Type DELETE in the box to confirm.')
      return
    }
    setDeleteBusy(true)
    setDeleteMessage(null)
    try {
      await deleteMyAccount(token)
      invalidateDashboardApiCache()
      await supabase.auth.signOut()
      navigate('/', { replace: true })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('confirm_required')) {
        setDeleteMessage('Confirmation failed.')
      } else if (msg.includes('account_delete_failed')) {
        setDeleteMessage('Could not delete the account. Try again or contact support.')
      } else {
        setDeleteMessage(msg)
      }
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="upload-page user-page">
      <header className="upload-header">
        <h1 className="upload-title">Account</h1>
        <p className="upload-sub">Public handle and account deletion</p>
        <div className="upload-header-links">
          <Link to="/" className="upload-back">
            ← Dashboard
          </Link>
          <Link to="/about" className="upload-back">
            About
          </Link>
        </div>
      </header>

      {!authReady && <p className="upload-hint">Loading…</p>}

      {authReady && !hasSupabase && (
        <section className="upload-card user-section">
          <p className="upload-hint">
            Configure <code className="user-code">VITE_SUPABASE_URL</code> and{' '}
            <code className="user-code">VITE_SUPABASE_ANON_KEY</code> to use account settings.
          </p>
        </section>
      )}

      {authReady && hasSupabase && !session && (
        <section className="upload-card user-section">
          <p className="upload-hint">Sign in from the dashboard to manage your account.</p>
          <Link to="/" className="upload-back">
            Go to dashboard
          </Link>
        </section>
      )}

      {authReady && hasSupabase && session && (
        <>
          <section className="upload-card user-section">
            <p className="user-signed-in">
              Signed in as <strong>{session.user.email ?? session.user.id}</strong>
            </p>
          </section>

          {username === null && (
            <section className="upload-card user-section">
              <p className="upload-hint user-warn">
                No <code className="user-code">public.users</code> profile for this account. Apply the
                Auth sync migration (see backend README) before you can set a handle.
              </p>
            </section>
          )}

          {typeof username === 'string' && (
            <section className="upload-card user-section">
              <h2 className="user-h2">Public handle</h2>
              <p className="upload-hint">
                Used in share URLs:{' '}
                <code className="user-code">/drop/{normalizeSlugDraft(usernameDraft) || '…'}/…</code>
              </p>
              {isAutoAssignedUsername(username) && (
                <p className="upload-hint user-warn">
                  This handle was assigned automatically. You can replace it with one you prefer (must
                  be unique).
                </p>
              )}
              <div className="user-handle-row">
                <label className="user-label" htmlFor="user-handle-input">
                  Handle
                </label>
                <input
                  id="user-handle-input"
                  className="user-input"
                  type="text"
                  value={usernameDraft}
                  onChange={(e) => {
                    setUsernameDraft(e.target.value)
                    setUsernameMessage(null)
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={usernameBusy}
                />
                <button
                  type="button"
                  className="user-btn-primary"
                  disabled={
                    usernameBusy ||
                    !isValidSlug(normalizeSlugDraft(usernameDraft)) ||
                    normalizeSlugDraft(usernameDraft) === username
                  }
                  onClick={() => void handleSaveUsername()}
                >
                  {usernameBusy ? 'Saving…' : 'Save handle'}
                </button>
              </div>
              {usernameMessage && <p className="user-err">{usernameMessage}</p>}
              <p className="upload-hint">
                Changing your handle invalidates old share links that used the previous name.
              </p>
            </section>
          )}

          <section className="upload-card user-section user-section--danger">
            <h2 className="user-h2">Delete account</h2>
            <p className="upload-hint">
              Permanently removes your auth user, profile, drop boxes, file metadata, and stored
              ciphertext. This cannot be undone. Local ML-KEM keys in this browser are not removed
              automatically.
            </p>
            <p className="upload-hint">
              Type <strong>DELETE</strong> to confirm:
            </p>
            <input
              className="user-input user-input--confirm"
              type="text"
              value={deleteConfirm}
              onChange={(e) => {
                setDeleteConfirm(e.target.value)
                setDeleteMessage(null)
              }}
              autoComplete="off"
              spellCheck={false}
              disabled={deleteBusy}
              placeholder="DELETE"
            />
            <button
              type="button"
              className="user-btn-danger"
              disabled={deleteBusy || deleteConfirm !== 'DELETE'}
              onClick={() => void handleDeleteAccount()}
            >
              {deleteBusy ? 'Deleting…' : 'Delete my account'}
            </button>
            {deleteMessage && <p className="user-err">{deleteMessage}</p>}
          </section>
        </>
      )}
    </div>
  )
}
