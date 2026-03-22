import type { FormEvent } from 'react'
import { ShareUrlCopyRow } from './ShareUrlCopyRow'
import type { SlugCheckState } from './types'

type MeDashboardStatus = 'idle' | 'loading' | 'ready' | 'error'
type KeysStatus = 'idle' | 'loading' | 'ready' | 'error'

type CreateLinkSectionProps = {
  newSlug: string
  onNewSlugDraftChange: (value: string) => void
  slugCheck: SlugCheckState
  slugNorm: string
  meDashboardStatus: MeDashboardStatus
  boxesLoading: boolean
  keysStatus: KeysStatus
  dashboardUsername: string | null | undefined
  createBusy: boolean
  createError: string | null
  createSuccess: string | null
  createLinkDisabled: boolean
  createLinkTitle: string | undefined
  onSubmit: (e: FormEvent) => void
  copiedUrlKey: string | null
  onCopyShareUrl: (idKey: string, url: string) => void
}

export function CreateLinkSection({
  newSlug,
  onNewSlugDraftChange,
  slugCheck,
  slugNorm,
  meDashboardStatus,
  boxesLoading,
  keysStatus,
  dashboardUsername,
  createBusy,
  createError,
  createSuccess,
  createLinkDisabled,
  createLinkTitle,
  onSubmit,
  copiedUrlKey,
  onCopyShareUrl,
}: CreateLinkSectionProps) {
  return (
    <section className="dash-section">
      <h2 className="dash-h2">Create link</h2>
      <p className="dash-create-desc">
        Choose a URL slug for a new drop box. Uploaders will use your ML-KEM public key from this
        browser to encrypt files.
      </p>
      <form className="dash-create-form" onSubmit={(e) => void onSubmit(e)}>
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
            onChange={(e) => onNewSlugDraftChange(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={
              createBusy || meDashboardStatus !== 'ready' || dashboardUsername === null
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
          {(keysStatus === 'idle' || keysStatus === 'loading') &&
            meDashboardStatus === 'ready' && <>Loading local keys for this account…</>}
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
            <ShareUrlCopyRow
              idKey="create-success"
              url={createSuccess}
              copied={copiedUrlKey === 'create-success'}
              onCopy={onCopyShareUrl}
            />
          </p>
        )}
      </form>
    </section>
  )
}
