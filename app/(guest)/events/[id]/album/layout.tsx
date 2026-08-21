import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { DEFAULT_EVENT_IMAGE_PATH } from '@/lib/event-images'
import { getSiteUrl } from '@/lib/site-url'
import { createClient } from '@/lib/supabase/server'

const GENERIC_TITLE = 'Sofra Shared Album'
const DEFAULT_DESCRIPTION = 'Photos shared around the Sofra.'

type AlbumMetaRow = {
  title: string
  cover_url: string | null
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const siteUrl = getSiteUrl()
  const fallbackImage = new URL(DEFAULT_EVENT_IMAGE_PATH, siteUrl).toString()
  const supabase = createClient()
  const { data } = await supabase
    .from('events')
    .select('title,cover_url')
    .eq('id', params.id)
    .maybeSingle()

  const event = data as AlbumMetaRow | null
  const title = event ? `Photos from ${event.title}` : GENERIC_TITLE
  const description = event
    ? `View and add photos from ${event.title}'s shared album.`
    : DEFAULT_DESCRIPTION
  const image = event?.cover_url || fallbackImage

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: new URL(`/events/${params.id}/album`, siteUrl).toString(),
      images: [{ url: image }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}

export default function EventAlbumLayout({ children }: { children: ReactNode }) {
  return children
}
