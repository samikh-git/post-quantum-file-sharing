import { Link } from 'react-router'
import './UploadPage.css'
import './AboutPage.css'

export default function AboutPage() {
  return (
    <div className="upload-page about-page">
      <header className="upload-header">
        <h1 className="upload-title">About</h1>
        <p className="upload-sub">
          Post-quantum–friendly encrypted file drops: your files are encrypted before they leave the
          browser.
        </p>
        <Link to="/" className="upload-back">
          ← Dashboard
        </Link>
      </header>

      <section className="upload-card about-section">
        <h2 className="about-h2">What this is</h2>
        <p className="upload-hint about-p">
          This app lets you create <strong>drop links</strong> — shareable URLs where others can
          upload files that only <strong>you</strong> can decrypt. The server stores ciphertext and
          metadata; it never sees your private key or plaintext file contents.
        </p>
      </section>

      <section className="upload-card about-section">
        <h2 className="about-h2">How encryption works</h2>
        <ul className="about-list">
          <li>
            <strong>ML-KEM-768</strong> (Module-Lattice Key Encapsulation) is used with{' '}
            <strong>AES-256-GCM</strong> so files are encrypted with a post-quantum hybrid design.
          </li>
          <li>
            Encryption runs in your browser via <strong>WebAssembly</strong>. Your{' '}
            <strong>secret key</strong> stays in <strong>IndexedDB</strong> on this device; the box
            stores only the recipient <strong>public key</strong> needed for uploads.
          </li>
          <li>
            Filenames are encrypted the same way, so the server only sees opaque blobs — not the real
            names — until you decrypt on the dashboard.
          </li>
        </ul>
      </section>

      <section className="upload-card about-section">
        <h2 className="about-h2">What the server sees</h2>
        <p className="upload-hint about-p">
          Sign-in, box metadata, and storage paths are handled by your configured backend and Supabase.
          File bytes are ciphertext only. Treat the service as untrusted for confidentiality: security
          relies on the crypto and your key material, not on the operator reading your files.
        </p>
      </section>

      <section className="upload-card about-section about-section--muted">
        <h2 className="about-h2">Limitations</h2>
        <p className="upload-hint about-p">
          Large files encrypt and decrypt in the browser; very big uploads may feel slow. Use the same
          browser profile where you created a box to decrypt files — if you lose your local ML-KEM
          keys, you cannot recover plaintext from ciphertext alone.
        </p>
      </section>
    </div>
  )
}
