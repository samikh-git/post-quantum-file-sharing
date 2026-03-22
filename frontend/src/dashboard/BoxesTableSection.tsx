import type { DashboardBox } from '../lib/api'
import { ShareUrlCopyRow } from './ShareUrlCopyRow'

type BoxesTableSectionProps = {
  boxesLoading: boolean
  boxes: DashboardBox[] | null
  selectedBoxId: string
  onSelectBox: (boxId: string) => void
  copiedUrlKey: string | null
  onCopyShareUrl: (idKey: string, url: string) => void
}

export function BoxesTableSection({
  boxesLoading,
  boxes,
  selectedBoxId,
  onSelectBox,
  copiedUrlKey,
  onCopyShareUrl,
}: BoxesTableSectionProps) {
  return (
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
                  className={box.id === selectedBoxId ? 'dash-row dash-row--selected' : 'dash-row'}
                  onClick={() => onSelectBox(box.id)}
                >
                  <td>
                    <button
                      type="button"
                      className="dash-slug"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectBox(box.id)
                      }}
                    >
                      {box.slug}
                    </button>
                  </td>
                  <td>
                    {box.shareURL ? (
                      <div className="dash-url-cell" onClick={(e) => e.stopPropagation()}>
                        <ShareUrlCopyRow
                          idKey={`box-${box.id}`}
                          url={box.shareURL}
                          copied={copiedUrlKey === `box-${box.id}`}
                          onCopy={onCopyShareUrl}
                        />
                      </div>
                    ) : (
                      <span className="dash-hint">—</span>
                    )}
                  </td>
                  <td>{box.is_active ? 'Yes' : 'No'}</td>
                  <td>{box.expires_at ? new Date(box.expires_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
