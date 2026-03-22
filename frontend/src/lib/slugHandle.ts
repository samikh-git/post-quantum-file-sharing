/** Normalizes draft text for URL slugs and public handles (lowercase, hyphens). */
export function normalizeSlugDraft(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function isValidSlug(s: string): boolean {
  if (s.length < 3 || s.length > 48) return false
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)
}

/** Auto-assigned fallback from DB trigger: `…_<uuid-without-hyphens>`. */
export function isAutoAssignedUsername(u: string): boolean {
  return /_[0-9a-f]{32}$/i.test(u)
}
