import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getSiteUrl } from '@/lib/site-url'
import EventDetailClient from './EventDetailClient'

// Themed fallback used whenever an event has no uploaded cover photo —
// matches the "no cover" fallback rendered by EventPaper itself.
const FALLBACK_IMAGE_PATH = '/design-preview/arabesque-ornament.png'
const GENERIC_TITLE = 'Sofra Invitation'
const DEFAULT_DESCRIPTION = "You're invited to a Sofra."

type EventMetaRow = {
  title: string
  tagline: string | null
  cover_url: string | null
  is_published: boolean
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const siteUrl = getSiteUrl()
  const fallbackImage = new URL(FALLBACK_IMAGE_PATH, siteUrl).toString()

  const supabase = createClient()
  // Public preview fields only — never the guest list or address, which stay
  // behind the locked/unlocked boundary enforced in EventDetailClient. Link
  // previews render for anyone the link is forwarded to, invited or not.
  const { data: ev } = await supabase
    .from('events')
    .select('title,tagline,cover_url,is_published')
    .eq('id', params.id)
    .maybeSingle()

  const event = ev as EventMetaRow | null

  // Unpublished drafts (or a missing/bad id) get a generic card instead of
  // leaking the draft title to whoever the link reaches before it's public.
  if (!event || event.is_published === false) {
    return {
      title: GENERIC_TITLE,
      description: DEFAULT_DESCRIPTION,
      openGraph: {
        title: GENERIC_TITLE,
        description: DEFAULT_DESCRIPTION,
        images: [{ url: fallbackImage }],
      },
    }
  }

  const title = event.title
  const description = event.tagline?.trim() || DEFAULT_DESCRIPTION
  const image = event.cover_url || fallbackImage

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: image }],
    },
  }
}

export default function EventDetailPage({ params }: { params: { id: string } }) {
  return <EventDetailClient params={params} />
}
