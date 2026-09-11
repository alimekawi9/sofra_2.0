import { getClientAppUser } from '@/lib/auth/client-user'

jest.unmock('@/lib/auth/client-user')

it('resolves the application profile only from a verified Supabase Auth user', async () => {
  const maybeSingle = jest.fn().mockResolvedValue({ data: { id: 'profile-1' }, error: null })
  const client = {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null }) },
    from: jest.fn().mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }
  await expect(getClientAppUser(client as never)).resolves.toEqual({ authUser: { id: 'auth-1' }, appUserId: 'profile-1' })
  expect(client.from).toHaveBeenCalledWith('users')
})

it('does not accept a localStorage profile id without an Auth user', async () => {
  localStorage.setItem('sofra_user_id', 'forged-profile')
  const client = { auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }) } }
  await expect(getClientAppUser(client as never)).resolves.toBeNull()
})
