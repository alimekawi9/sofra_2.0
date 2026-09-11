import '@testing-library/jest-dom'

// Existing page tests set a deterministic profile id in localStorage. Keep
// that fixture mechanism test-only while production resolves the same id from
// a verified Supabase Auth user through lib/auth/client-user.
jest.mock('@/lib/auth/client-user', () => ({
  getCurrentAppUserId: jest.fn(async () => localStorage.getItem('sofra_user_id')),
  getClientAppUser: jest.fn(async () => {
    const id = localStorage.getItem('sofra_user_id')
    return id ? { authUser: { id: `auth-${id}` }, appUserId: id } : null
  }),
}))

// jsdom has no PointerEvent constructor, so fireEvent.pointerDown/Up would
// otherwise dispatch events with clientX/clientY stuck at undefined.
if (typeof window !== 'undefined' && typeof (window as unknown as { PointerEvent?: unknown }).PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    constructor(type: string, params: MouseEventInit = {}) {
      super(type, params)
    }
  }
  ;(window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventPolyfill
}
