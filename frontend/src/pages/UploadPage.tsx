import { useCallback, useEffect, useState, type ChangeEvent } from 'react'
import { Link, useParams } from 'react-router'
import {
  confirmUploadedFile,
  fetchDropBoxInfo,
  putCiphertextToSignedUrl,
  registerFileUpload,
  type DropBoxInfo,
} from '../lib/api'
import {
  bytesToBase64,
  encryptPlaintextForRecipient,
  ensureWasmLoaded,
} from '../lib/cryptoLocal'
import './UploadPage.css'

type Step =
  | 'idle'
  | 'loading_box'
  | 'ready'
  | 'encrypting'
  | 'registering'
  | 'uploading'
  | 'confirming'
  | 'done'
  | 'error'

function safeStorageLeaf(filename: string): string {
  const base = filename
    .replace(/[/\\]/g, '_')
    .replace(/[^\w.\-()+@[\]]/g, '_')
    .slice(0, 160)
  return base || 'file'
}

export default function UploadPage() {
  const { username = '', slug = '' } = useParams<{ username: string; slug: string }>()

  const [box, setBox] = useState<DropBoxInfo | null>(null)
  const [boxError, setBoxError] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('loading_box')
  const [message, setMessage] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setBox(null)
    setBoxError(null)
    setMessage(null)
    setLastError(null)
    setStep('loading_box')

    if (!username.trim() || !slug.trim()) {
      setBoxError('invalid_link')
      setStep('error')
      return undefined
    }

    void (async () => {
      try {
        await ensureWasmLoaded()
        if (cancelled) return
        const info = await fetchDropBoxInfo(username, slug)
        if (cancelled) return
        setBox(info)
        setStep('ready')
      } catch (e: unknown) {
        if (cancelled) return
        setBoxError(e instanceof Error ? e.message : String(e))
        setStep('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [username, slug])

  const runUpload = useCallback(
    async (file: File) => {
      if (!box) return
      setLastError(null)
      setMessage(null)

      try {
        setStep('encrypting')
        const namePlain = new TextEncoder().encode(file.name)
        const nameEnc = await encryptPlaintextForRecipient(box.publicKey, namePlain)
        const encryptedName = JSON.stringify({
          v: 1,
          n: bytesToBase64(nameEnc.nonce),
          k: bytesToBase64(nameEnc.kemCiphertext),
          c: bytesToBase64(nameEnc.encrypted),
        })

        const fileBuf = new Uint8Array(await file.arrayBuffer())
        const bodyEnc = await encryptPlaintextForRecipient(box.publicKey, fileBuf)

        setStep('registering')
        const objectLeaf = `${crypto.randomUUID()}_${safeStorageLeaf(file.name)}`
        const s3Key = `${box.ownerId}/${slug}/${objectLeaf}`

        const { uploadURL, fileId } = await registerFileUpload(box.boxId, {
          encryptedName,
          contentType: file.type || 'application/octet-stream',
          byteSizeBytes: bodyEnc.encrypted.byteLength,
          s3Key,
          nonce: bytesToBase64(bodyEnc.nonce),
          kemCiphertext: bytesToBase64(bodyEnc.kemCiphertext),
        })

        setStep('uploading')
        await putCiphertextToSignedUrl(
          uploadURL,
          bodyEnc.encrypted,
          file.type || 'application/octet-stream'
        )

        setStep('confirming')
        await confirmUploadedFile(fileId)

        setStep('done')
        setMessage('Upload complete. The box owner can see this file in their dashboard.')
      } catch (e: unknown) {
        setStep('ready')
        setLastError(e instanceof Error ? e.message : String(e))
      }
    },
    [box, slug]
  )

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) void runUpload(f)
  }

  const busy =
    step === 'encrypting' ||
    step === 'registering' ||
    step === 'uploading' ||
    step === 'confirming'

  return (
    <div className="upload-page">
      <header className="upload-header">
        <h1 className="upload-title">Secure upload</h1>
        <p className="upload-sub">
          Drop for <strong>{username}</strong> / <strong>{slug}</strong>
        </p>
        <div className="upload-header-links">
          <Link to="/" className="upload-back">
            ← Dashboard
          </Link>
          <Link to="/about" className="upload-back">
            About
          </Link>
        </div>
      </header>

      {boxError && (
        <p className="upload-err">
          {boxError === 'invalid_link'
            ? 'This link is incomplete. Use the full URL: /drop/<username>/<slug>.'
            : boxError === 'not_found' || boxError.includes('not_found')
              ? 'This drop link was not found or is no longer available.'
              : boxError}
        </p>
      )}

      {step === 'loading_box' && !boxError && (
        <section className="upload-card upload-card--muted">
          <p className="upload-status">Loading drop details…</p>
        </section>
      )}

      {box && step !== 'error' && (
        <section className="upload-card">
          <p className="upload-hint">
            Files are encrypted in your browser with the box owner&apos;s public key before upload.
            The server only stores ciphertext.
          </p>

          <label className="upload-file-label">
            <input
              type="file"
              className="upload-file-input"
              onChange={onFileChange}
              disabled={busy}
            />
            <span className="upload-file-btn">
              {busy ? stepLabel(step) : step === 'done' ? 'Upload another file' : 'Choose file'}
            </span>
          </label>

          {busy && <p className="upload-status">{stepLabel(step)}…</p>}
          {message && <p className="upload-ok">{message}</p>}
          {lastError && <p className="upload-err">{lastError}</p>}
        </section>
      )}
    </div>
  )
}

function stepLabel(step: Step): string {
  switch (step) {
    case 'encrypting':
      return 'Encrypting'
    case 'registering':
      return 'Requesting upload slot'
    case 'uploading':
      return 'Uploading ciphertext to storage'
    case 'confirming':
      return 'Confirming with server'
    default:
      return 'Working'
  }
}
