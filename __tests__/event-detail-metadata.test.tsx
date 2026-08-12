/** @jest-environment node */

import { generateMetadata } from '@/app/(guest)/events/[id]/page'
import { createClient } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server')

const PARAMS = { params: { id: 'ev-1' } }

type EventMetaRow = {
  title: string
  tagline: string | null
  cover_url: string | null
  is_published: boolean
}

function makeSupabase(event: EventMetaRow | null) {
  const maybeSingleMock = jest.fn().mockResolvedValue({ data: event, error: null })
  const eqMock = jest.fn().mockReturnValue({ maybeSingle: maybeSingleMock })
  const selectMock = jest.fn().mockReturnValue({ eq: eqMock })
  const fromMock = jest.fn().mockReturnValue({ select: selectMock })
  return { from: fromMock, selectMock, eqMock }
}

beforeEach(() => jest.clearAllMocks())

it('uses the event title, tagline, and cover photo when published', async () => {
  const supabase = makeSupabase({
    title: 'Casa Mekawi',
    tagline: 'An intimate gathering',
    cover_url: 'https://storage.example.com/covers/ev-1.jpg',
    is_published: true,
  })
  ;(createClient as jest.Mock).mockReturnValue(supabase)

  const metadata = await generateMetadata(PARAMS)

  expect(metadata.title).toBe('Casa Mekawi')
  expect(metadata.description).toBe('An intimate gathering')
  expect(metadata.openGraph?.title).toBe('Casa Mekawi')
  expect(metadata.openGraph?.description).toBe('An intimate gathering')
  expect(metadata.openGraph?.images).toEqual([{ url: 'https://storage.example.com/covers/ev-1.jpg' }])
})

it('only requests public preview fields, never the guest list or address', async () => {
  const supabase = makeSupabase({
    title: 'Casa Mekawi',
    tagline: null,
    cover_url: null,
    is_published: true,
  })
  ;(createClient as jest.Mock).mockReturnValue(supabase)

  await generateMetadata(PARAMS)

  expect(supabase.selectMock).toHaveBeenCalledWith('title,tagline,cover_url,is_published')
  expect(supabase.eqMock).toHaveBeenCalledWith('id', 'ev-1')
})

it('falls back to a default description when no tagline is set', async () => {
  const supabase = makeSupabase({
    title: 'Casa Mekawi',
    tagline: null,
    cover_url: 'https://storage.example.com/covers/ev-1.jpg',
    is_published: true,
  })
  ;(createClient as jest.Mock).mockReturnValue(supabase)

  const metadata = await generateMetadata(PARAMS)

  expect(metadata.description).toBe("You're invited to a Sofra.")
  expect(metadata.openGraph?.description).toBe("You're invited to a Sofra.")
})

it('falls back to the branded themed image when there is no cover photo', async () => {
  const supabase = makeSupabase({
    title: 'Casa Mekawi',
    tagline: 'An intimate gathering',
    cover_url: null,
    is_published: true,
  })
  ;(createClient as jest.Mock).mockReturnValue(supabase)

  const metadata = await generateMetadata(PARAMS)

  expect(metadata.openGraph?.images).toEqual([
    { url: 'http://localhost:3000/design-preview/arabesque-ornament.png' },
  ])
})

it('does not leak the real title of an unpublished draft event', async () => {
  const supabase = makeSupabase({
    title: 'Secret Surprise Party',
    tagline: 'Do not tell the guest of honor',
    cover_url: 'https://storage.example.com/covers/ev-1.jpg',
    is_published: false,
  })
  ;(createClient as jest.Mock).mockReturnValue(supabase)

  const metadata = await generateMetadata(PARAMS)

  expect(metadata.title).toBe('Sofra Invitation')
  expect(metadata.description).toBe("You're invited to a Sofra.")
  expect(metadata.openGraph?.title).toBe('Sofra Invitation')
  expect(metadata.openGraph?.images).toEqual([
    { url: 'http://localhost:3000/design-preview/arabesque-ornament.png' },
  ])
})

it('returns the generic fallback for a missing or deleted event id', async () => {
  const supabase = makeSupabase(null)
  ;(createClient as jest.Mock).mockReturnValue(supabase)

  const metadata = await generateMetadata(PARAMS)

  expect(metadata.title).toBe('Sofra Invitation')
  expect(metadata.openGraph?.images).toEqual([
    { url: 'http://localhost:3000/design-preview/arabesque-ornament.png' },
  ])
})
