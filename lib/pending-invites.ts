export const PENDING_INVITES_KEY = 'sofra_pending_invites'

export type PendingInvite = {
  id: string
  title: string
  event_date: string
  venue: string | null
  theme: string
  cover_url: string | null
}

export function readPendingInvites(): PendingInvite[] {
  if (typeof window === 'undefined') return []
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_INVITES_KEY) ?? '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export function rememberPendingInvite(invite: PendingInvite): void {
  const rest = readPendingInvites().filter((item) => item.id !== invite.id)
  localStorage.setItem(PENDING_INVITES_KEY, JSON.stringify([invite, ...rest]))
}

export function forgetPendingInvite(eventId: string): void {
  localStorage.setItem(
    PENDING_INVITES_KEY,
    JSON.stringify(readPendingInvites().filter((item) => item.id !== eventId))
  )
}
