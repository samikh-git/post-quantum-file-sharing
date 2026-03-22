import { Link } from 'react-router'
import './UploadPage.css'

export default function NotFoundPage() {
  return (
    <div className="upload-page">
      <header className="upload-header">
        <h1 className="upload-title">Page not found</h1>
        <p className="upload-sub">This URL does not match an app route.</p>
        <p className="upload-hint upload-hint--spaced">
          Drop links look like <code className="upload-code-inline">/drop/owner-username/box-slug</code>
          (copy the full link from the owner).
        </p>
        <Link to="/" className="upload-back">
          ← Dashboard
        </Link>
      </header>
    </div>
  )
}
