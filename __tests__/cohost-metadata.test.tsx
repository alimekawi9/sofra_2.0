import { createClient } from '@/lib/supabase/server'
import { generateMetadata } from '@/app/(guest)/events/[id]/cohost/layout'

jest.mock('@/lib/supabase/server')

it('uses the event cover image in co-host link previews', async () => {
  const maybeSingle = jest.fn().mockResolvedValue({ data: { title: 'Casa Mekawi', tagline: 'Dinner together', cover_url: 'https://storage.example.com/cover.jpg' } })
  ;(createClient as jest.Mock).mockReturnValue({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) })

  const metadata = await generateMetadata({ params: { id: 'event-1' } })
  expect(metadata.openGraph?.images).toEqual([{ url: 'https://storage.example.com/cover.jpg' }])
  expect(metadata.twitter?.images).toEqual(['https://storage.example.com/cover.jpg'])
  expect(metadata.title).toBe('Co-host Casa Mekawi')
})
