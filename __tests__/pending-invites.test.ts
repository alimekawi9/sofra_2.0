import { forgetPendingInvite, readPendingInvites, rememberPendingInvite } from '@/lib/pending-invites'

const invite = {
  id: 'event-1',
  title: 'Dinner',
  event_date: '2099-01-01T19:00:00Z',
  venue: 'Home',
  theme: 'ember',
  cover_url: null,
}

beforeEach(() => localStorage.clear())

it('retains one current copy of an opened invite', () => {
  rememberPendingInvite(invite)
  rememberPendingInvite({ ...invite, title: 'Updated dinner' })
  expect(readPendingInvites()).toEqual([{ ...invite, title: 'Updated dinner' }])
})

it('removes an invite once an RSVP is saved', () => {
  rememberPendingInvite(invite)
  forgetPendingInvite(invite.id)
  expect(readPendingInvites()).toEqual([])
})
