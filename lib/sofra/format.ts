export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long' })
}

export function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return `${fmtDate(iso)} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((n) => n[0]?.toUpperCase() ?? '').join('')
}

export function adventureLabel(v: number) {
  if (v < 20) return 'Keep it familiar'
  if (v < 40) return 'Gently new'
  if (v < 60) return 'Open to most things'
  if (v < 80) return 'Push me a little'
  return 'Chef, surprise me'
}
