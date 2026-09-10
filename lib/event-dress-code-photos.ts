import type { SupabaseClient } from '@supabase/supabase-js'
import { runBatchWithConcurrency } from './shared-album'

// A small curated set of reference images (e.g. "cocktail attire") -- not a
// social album, so there's no need for the Shared Album's much higher cap.
export const MAX_DRESS_CODE_PHOTOS = 6
const UPLOAD_CONCURRENCY = 3

export interface DressCodePhotoRow {
  id: string
  event_id: string
  storage_path: string
  sort_order: number
  created_at: string
}

export interface DressCodePhoto extends DressCodePhotoRow {
  url: string
}

function publicUrlFor(supabase: SupabaseClient, storagePath: string): string {
  return supabase.storage.from('event-photos').getPublicUrl(storagePath).data.publicUrl
}

export async function fetchDressCodePhotos(
  supabase: SupabaseClient,
  eventId: string
): Promise<{ photos: DressCodePhoto[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('event_dress_code_photos')
      .select('id,event_id,storage_path,sort_order,created_at')
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true })

    if (error) return { photos: [], error: error.message }

    const rows = (data ?? []) as DressCodePhotoRow[]
    return {
      photos: rows.map((row) => ({ ...row, url: publicUrlFor(supabase, row.storage_path) })),
      error: null,
    }
  } catch (caught) {
    return { photos: [], error: caught instanceof Error ? caught.message : 'Unexpected request failure' }
  }
}

export interface UploadDressCodePhotosResult {
  succeeded: DressCodePhoto[]
  failed: Array<{ name: string; message: string }>
}

export async function uploadDressCodePhotos(
  supabase: SupabaseClient,
  params: { eventId: string; files: File[]; startingSortOrder: number }
): Promise<UploadDressCodePhotosResult> {
  const succeeded: DressCodePhoto[] = []
  const failed: Array<{ name: string; message: string }> = []

  await runBatchWithConcurrency(
    params.files,
    UPLOAD_CONCURRENCY,
    async (file, index) => {
      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg'
      const path = `dress-code/${params.eventId}/${Date.now()}-${index}.${ext}`
      try {
        const { error: uploadError } = await supabase.storage
          .from('event-photos')
          .upload(path, file, { contentType: file.type || undefined })

        if (uploadError) {
          failed.push({ name: file.name, message: uploadError.message })
          return
        }

        const { data: inserted, error: insertError } = await supabase
          .from('event_dress_code_photos')
          .insert({ event_id: params.eventId, storage_path: path, sort_order: params.startingSortOrder + index })
          .select('id,event_id,storage_path,sort_order,created_at')
          .single()

        if (insertError || !inserted) {
          await supabase.storage.from('event-photos').remove([path])
          failed.push({ name: file.name, message: insertError?.message ?? 'Could not save that photo.' })
          return
        }

        const row = inserted as DressCodePhotoRow
        succeeded.push({ ...row, url: publicUrlFor(supabase, row.storage_path) })
      } catch (caught) {
        failed.push({ name: file.name, message: caught instanceof Error ? caught.message : 'Unexpected request failure' })
      }
    }
  )

  return { succeeded, failed }
}

export async function deleteDressCodePhoto(
  supabase: SupabaseClient,
  photo: { id: string; storage_path: string }
): Promise<{ ok: boolean; error?: string }> {
  try {
    await supabase.storage.from('event-photos').remove([photo.storage_path])
    const { error } = await supabase.from('event_dress_code_photos').delete().eq('id', photo.id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (caught) {
    return { ok: false, error: caught instanceof Error ? caught.message : 'Unexpected request failure' }
  }
}
