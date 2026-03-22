export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function statusClass(status: string): string {
  if (status === 'ACTIVE') return 'dash-badge dash-badge--active'
  if (status === 'PENDING') return 'dash-badge dash-badge--pending'
  return 'dash-badge'
}

export function safeDownloadFilename(name: string): string {
  const t = name.replace(/[/\\]/g, '_').trim()
  return t || 'download.bin'
}
