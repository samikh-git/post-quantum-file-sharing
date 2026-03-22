import { IconCheck, IconClipboard } from './icons'

type ShareUrlCopyRowProps = {
  idKey: string
  url: string
  copied: boolean
  onCopy: (idKey: string, url: string) => void
}

export function ShareUrlCopyRow({ idKey, url, copied, onCopy }: ShareUrlCopyRowProps) {
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
          void onCopy(idKey, url)
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
