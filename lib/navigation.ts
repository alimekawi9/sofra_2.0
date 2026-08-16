// Only permit relative paths within this app. This rejects absolute URLs,
// protocol-relative URLs, and non-path values to prevent open redirects.
export function safeNext(raw: string | null): string {
  if (!raw?.startsWith('/') || raw.startsWith('//')) return '/events'
  return raw
}

export function joinHref(next: string): string {
  return `/join?next=${encodeURIComponent(safeNext(next))}`
}
