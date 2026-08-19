import { isEventDateUndecided } from './event-date'

export type UpdateTemplateId = 'photos' | 'details' | 'custom'

export type UpdateEventInput = {
  title: string
  event_date: string
  venue: string | null
  address: string | null
}

function formatUpdateDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function formatUpdateTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function buildDetailsMessage(event: UpdateEventInput, inviteUrl: string): string {
  const lines = [`Update on ${event.title}:`]

  if (isEventDateUndecided(event.event_date)) {
    lines.push('Date & time: still being finalized')
  } else {
    lines.push(`${formatUpdateDate(event.event_date)} at ${formatUpdateTime(event.event_date)}`)
  }

  if (event.venue) {
    lines.push(event.address ? `${event.venue} — ${event.address}` : event.venue)
  } else {
    lines.push('Location: still being finalized')
  }

  lines.push('', inviteUrl)
  return lines.join('\n')
}

export function buildUpdateMessage(
  templateId: UpdateTemplateId,
  event: UpdateEventInput,
  inviteUrl: string,
  albumUrl: string
): string {
  if (templateId === 'photos') {
    return `Photos from ${event.title} are up! Add yours to the shared album: ${albumUrl}\n\n${inviteUrl}`
  }
  if (templateId === 'details') {
    return buildDetailsMessage(event, inviteUrl)
  }
  return inviteUrl
}
