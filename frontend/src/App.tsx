import './App.css'
import { BoxFilesSection } from './dashboard/BoxFilesSection'
import { BoxesTableSection } from './dashboard/BoxesTableSection'
import { CreateLinkSection } from './dashboard/CreateLinkSection'
import { DashboardHeader } from './dashboard/DashboardHeader'
import { useDropDashboard } from './dashboard/useDropDashboard'

function App() {
  const d = useDropDashboard()

  return (
    <div className="dash">
      <DashboardHeader
        session={d.session}
        authReady={d.authReady}
        hasSupabase={d.hasSupabase}
        keysStatus={d.keysStatus}
        keysError={d.keysError}
        email={d.email}
        setEmail={d.setEmail}
        password={d.password}
        setPassword={d.setPassword}
        authBusy={d.authBusy}
        authMessage={d.authMessage}
        signUpUsername={d.signUpUsername}
        setSignUpUsername={d.setSignUpUsername}
        onSignIn={d.handleSignIn}
        onSignUp={d.handleSignUp}
        onGoogleSignIn={d.handleGoogleSignIn}
        onSignOut={d.handleSignOut}
      />

      {d.session && (
        <>
          {d.apiError && <p className="dash-api-err">API: {d.apiError}</p>}
          {d.dashboardUsername === null && (
            <p className="dash-hint dash-hint--warn">
              No <code className="dash-mono">public.users</code> profile for this Auth user. If you
              use the repo migration that syncs new signups, apply it (see backend README);
              otherwise insert a row whose <code className="dash-mono">id</code> matches your Auth
              user id.
            </p>
          )}

          <CreateLinkSection
            newSlug={d.newSlug}
            onNewSlugDraftChange={d.onNewSlugDraftChange}
            slugCheck={d.slugCheck}
            slugNorm={d.slugNorm}
            meDashboardStatus={d.meDashboardStatus}
            boxesLoading={d.boxesLoading}
            keysStatus={d.keysStatus}
            dashboardUsername={d.dashboardUsername}
            createBusy={d.createBusy}
            createError={d.createError}
            createSuccess={d.createSuccess}
            createLinkDisabled={d.createLinkDisabled}
            createLinkTitle={d.createLinkTitle}
            onSubmit={d.handleCreateLink}
            copiedUrlKey={d.copiedUrlKey}
            onCopyShareUrl={d.copyShareUrl}
          />

          <BoxesTableSection
            boxesLoading={d.boxesLoading}
            boxes={d.boxes}
            selectedBoxId={d.selectedBoxId}
            onSelectBox={d.setSelectedBoxId}
            copiedUrlKey={d.copiedUrlKey}
            onCopyShareUrl={d.copyShareUrl}
          />

          {d.selectedBox && (
            <BoxFilesSection
              selectedBox={d.selectedBox}
              files={d.files}
              filesLoading={d.filesLoading}
              decryptedFileNames={d.decryptedFileNames}
              keysStatus={d.keysStatus}
              fileDownloadError={d.fileDownloadError}
              fileConfirmError={d.fileConfirmError}
              confirmingFileId={d.confirmingFileId}
              downloadingFileId={d.downloadingFileId}
              onConfirmFile={d.handleConfirmFile}
              onDownloadFile={d.handleDownloadFile}
            />
          )}
        </>
      )}

      {!d.session && d.authReady && d.hasSupabase && (
        <p className="dash-hint dash-hint-center">Sign in to load your dashboard from the API.</p>
      )}
    </div>
  )
}

export default App
