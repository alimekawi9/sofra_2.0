import { buildUpdateMessage, type UpdateEventInput } from '@/lib/event-updates'

const INVITE_URL = 'https://sofra.app/events/ev-1?entry=update'
const ALBUM_URL = 'https://sofra.app/events/ev-1/album?entry=update'

const DECIDED_EVENT: UpdateEventInput = {
  title: "Layla's Long Table",
  event_date: '2027-08-11T19:00:00.000Z',
  venue: 'Krasi',
  address: '48 Gloucester St, Boston',
}

const UNDECIDED_EVENT: UpdateEventInput = {
  title: "Layla's Long Table",
  event_date: '9999-12-31T12:00:00.000Z',
  venue: null,
  address: null,
}

function expectedDateTime(iso: string): string {
  const date = new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
  const time = new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
  return `${date} at ${time}`
}

describe('buildUpdateMessage', () => {
  it('builds the photos template with the album link and the invite link', () => {
    const result = buildUpdateMessage('photos', DECIDED_EVENT, INVITE_URL, ALBUM_URL)
    expect(result).toBe(
      `Photos from Layla's Long Table are up! Add yours to the shared album: ${ALBUM_URL}\n\n${INVITE_URL}`
    )
  })

  it('builds the details template with a decided date, venue, and address', () => {
    const result = buildUpdateMessage('details', DECIDED_EVENT, INVITE_URL, ALBUM_URL)
    expect(result).toBe(
      `Update on Layla's Long Table:\n${expectedDateTime(DECIDED_EVENT.event_date)}\nKrasi — 48 Gloucester St, Boston\n\n${INVITE_URL}`
    )
  })

  it('builds the details template with a decided venue but no address', () => {
    const event: UpdateEventInput = { ...DECIDED_EVENT, address: null }
    const result = buildUpdateMessage('details', event, INVITE_URL, ALBUM_URL)
    expect(result).toBe(
      `Update on Layla's Long Table:\n${expectedDateTime(event.event_date)}\nKrasi\n\n${INVITE_URL}`
    )
  })

  it('builds the details template honestly when date and venue are both still undecided', () => {
    const result = buildUpdateMessage('details', UNDECIDED_EVENT, INVITE_URL, ALBUM_URL)
    expect(result).toBe(
      `Update on Layla's Long Table:\nDate & time: still being finalized\nLocation: still being finalized\n\n${INVITE_URL}`
    )
  })

  it('builds the custom template with just the invite link', () => {
    const result = buildUpdateMessage('custom', UNDECIDED_EVENT, INVITE_URL, ALBUM_URL)
    expect(result).toBe(INVITE_URL)
  })
})
