import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getSiteUrl } from '@/lib/site-url'
import { DEFAULT_EVENT_IMAGE_PATH } from '@/lib/event-images'

type EventMetaRow = { title: string; tagline: string | null; cover_url: string | null }

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const fallbackImage = new URL(DEFAULT_EVENT_IMAGE_PATH, getSiteUrl()).toString()
  const { data } = await createClient()
    .from('events')
    .select('title,tagline,cover_url,is_published')
    .eq('id', params.id)
    .maybeSingle()
  const event = data as EventMetaRow | null
  const title = event ? `Co-host ${event.title}` : 'Sofra Co-host Invitation'
  const description = event?.tagline?.trim() || "You're invited to co-host a Sofra."
  const image = event?.cover_url || fallbackImage

  return {
    title,
    description,
    openGraph: { title, description, type: 'website', images: [{ url: image }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  }
}

export default function CohostInviteLayout({ children }: { children: ReactNode }) {
  return children
}
