import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Link } from 'react-router'
import { IconGoogle } from './icons'

type KeysStatus = 'idle' | 'loading' | 'ready' | 'error'

type DashboardHeaderProps = {
  session: Session | null
  authReady: boolean
  hasSupabase: boolean
  keysStatus: KeysStatus
  keysError: string | null
  email: string
  setEmail: (v: string) => void
  password: string
  setPassword: (v: string) => void
  authBusy: boolean
  authMessage: string | null
  signUpUsername: string
  setSignUpUsername: (v: string) => void
  onSignIn: (e: FormEvent) => void
  onSignUp: () => void
  onGoogleSignIn: () => void
  onSignOut: () => void
}

export function DashboardHeader({
  session,
  authReady,
  hasSupabase,
  keysStatus,
  keysError,
  email,
  setEmail,
  password,
  setPassword,
  authBusy,
  authMessage,
  signUpUsername,
  setSignUpUsername,
  onSignIn,
  onSignUp,
  onGoogleSignIn,
  onSignOut,
}: DashboardHeaderProps) {
  return (
    <header className="dash-header">
      <div className="dash-header-top">
        <div>
          <h1 className="dash-title">Drop Links</h1>
          <p className="dash-sub">Shareable URLs and upload status</p>
        </div>
        <nav className="dash-header-nav" aria-label="Site">
          {session && (
            <Link className="dash-about-link" to="/user">
              Account
            </Link>
          )}
          <Link className="dash-about-link" to="/about">
            About
          </Link>
        </nav>
      </div>

      <div className="dash-keys">
        <strong>Local keys:</strong>{' '}
        {keysStatus === 'idle' && !session && (
          <span className="dash-keys-idle">
            Sign in — each account gets its own ML-KEM key in IndexedDB on this device.
          </span>
        )}
        {keysStatus === 'idle' && session && 'Preparing ML-KEM (IndexedDB) for this account…'}
        {keysStatus === 'loading' && 'Preparing ML-KEM (IndexedDB)…'}
        {keysStatus === 'ready' && (
          <span className="dash-keys-ok">ML-KEM-768 key pair for this account (IndexedDB)</span>
        )}
        {keysStatus === 'error' && (
          <span className="dash-keys-err">Could not load WASM / keys: {keysError}</span>
        )}
      </div>

      {!hasSupabase && (
        <p className="dash-warn">
          Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to{' '}
          <code>.env</code> (see <code>.env.example</code>) — without them, email sign-in and
          Continue with Google are hidden. Backend: run API on port <code>3001</code> or set{' '}
          <code>VITE_API_URL</code>.
        </p>
      )}

      {authReady && hasSupabase && (
        <div className="dash-auth">
          {session ? (
            <div className="dash-auth-row">
              <span className="dash-auth-user">
                Signed in as <strong>{session.user.email ?? session.user.id}</strong>
              </span>
              <button type="button" className="dash-btn" onClick={() => void onSignOut()}>
                Sign out
              </button>
            </div>
          ) : (
            <div className="dash-auth-signin-panel">
              <div className="dash-auth-methods">
                <button
                  type="button"
                  className="dash-auth-google"
                  disabled={authBusy}
                  onClick={() => void onGoogleSignIn()}
                >
                  <IconGoogle />
                  Continue with Google
                </button>
                <p className="dash-auth-divider">
                  <span>or email</span>
                </p>
                <input
                  className="dash-auth-handle-input"
                  type="text"
                  placeholder="Public handle (for sign up)"
                  value={signUpUsername}
                  onChange={(e) => setSignUpUsername(e.target.value)}
                  autoComplete="username"
                  spellCheck={false}
                />
                <form className="dash-auth-form" onSubmit={(e) => void onSignIn(e)}>
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
                  <div className="dash-auth-form-actions">
                    <button type="submit" disabled={authBusy}>
                      Sign in
                    </button>
                    <button
                      type="button"
                      className="dash-btn-secondary"
                      disabled={authBusy}
                      onClick={() => void onSignUp()}
                    >
                      Sign up
                    </button>
                  </div>
                </form>
                {authMessage && <p className="dash-auth-msg">{authMessage}</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
