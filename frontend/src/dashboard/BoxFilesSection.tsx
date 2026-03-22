import type { DashboardBox, DashboardFile } from '../lib/api'
import { IconArrowDown } from './icons'
import { formatBytes, statusClass } from './utils'

type KeysStatus = 'idle' | 'loading' | 'ready' | 'error'

type BoxFilesSectionProps = {
  selectedBox: DashboardBox
  files: DashboardFile[] | null
  filesLoading: boolean
  decryptedFileNames: Record<string, string>
  keysStatus: KeysStatus
  fileDownloadError: string | null
  fileConfirmError: string | null
  confirmingFileId: string | null
  downloadingFileId: string | null
  onConfirmFile: (f: DashboardFile) => void
  onDownloadFile: (f: DashboardFile) => void
}

export function BoxFilesSection({
  selectedBox,
  files,
  filesLoading,
  decryptedFileNames,
  keysStatus,
  fileDownloadError,
  fileConfirmError,
  confirmingFileId,
  downloadingFileId,
  onConfirmFile,
  onDownloadFile,
}: BoxFilesSectionProps) {
  return (
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
                          onClick={() => void onConfirmFile(f)}
                        >
                          {confirmingFileId === f.id ? '…' : 'Finalize'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="dash-download-btn"
                        title={downloadingFileId === f.id ? 'Downloading…' : 'Download file'}
                        aria-label={
                          downloadingFileId === f.id ? 'Downloading file' : 'Download file'
                        }
                        aria-busy={downloadingFileId === f.id}
                        disabled={
                          f.status !== 'ACTIVE' ||
                          keysStatus !== 'ready' ||
                          downloadingFileId === f.id
                        }
                        onClick={() => void onDownloadFile(f)}
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
  )
}
