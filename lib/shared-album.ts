import type { SupabaseClient } from '@supabase/supabase-js'

export const MAX_PREVIEW_TILES = 6
// Total cap for the whole shared album, not just one upload batch --
// validateUploadBatch checks new selections against remaining room under
// this cap (existingCount + fileCount), so a single batch can never exceed
// it either when starting from an empty album.
export const MAX_UPLOAD_BATCH = 20
export const UPLOAD_CONCURRENCY = 3

export interface AlbumPhotoRow {
  id: string
  event_id: string
  uploaded_by: string
  storage_path: string
  caption: string | null
  upload_batch_id: string | null
  created_at: string
}

export interface AlbumPhoto extends AlbumPhotoRow {
  url: string
}

export interface AlbumUploader {
  id: string
  name: string
  photoUrl: string | null
}

export interface PhotoComment {
  id: string
  photo_id: string
  user_id: string
  body: string
  created_at: string
}

export interface PreviewResult<T> {
  tiles: T[]
  overflowCount: number
}

// 6+ photos: reserve the last preview slot for a "+N" tile rather than
// growing Event Details indefinitely (23 photos -> 5 tiles + "+18").
export function buildPreviewTiles<T>(photos: T[], max: number = MAX_PREVIEW_TILES): PreviewResult<T> {
  if (photos.length <= max) {
    return { tiles: photos, overflowCount: 0 }
  }
  const visibleCount = max - 1
  return {
    tiles: photos.slice(0, visibleCount),
    overflowCount: photos.length - visibleCount,
  }
}

export function validateUploadBatch(fileCount: number, existingCount: number = 0): { ok: boolean; message?: string } {
  if (fileCount === 0) return { ok: false, message: 'Choose at least one photo.' }
  const remaining = MAX_UPLOAD_BATCH - existingCount
  if (fileCount > remaining) {
    if (existingCount === 0) {
      return { ok: false, message: `You can upload up to ${MAX_UPLOAD_BATCH} photos at a time.` }
    }
    if (remaining <= 0) {
      return { ok: false, message: `This album is full — up to ${MAX_UPLOAD_BATCH} photos per event.` }
    }
    return {
      ok: false,
      message: `You can only add ${remaining} more ${remaining === 1 ? 'photo' : 'photos'} — up to ${MAX_UPLOAD_BATCH} per event.`,
    }
  }
  return { ok: true }
}

// Generic bounded-concurrency runner so a batch of 20 uploads doesn't fire
// all at once, while still reporting real completed/total progress.
export async function runBatchWithConcurrency<TItem, TResult>(
  items: TItem[],
  concurrency: number,
  worker: (item: TItem, index: number) => Promise<TResult>,
  onProgress?: (completed: number, total: number) => void
): Promise<TResult[]> {
  const results: TResult[] = new Array(items.length)
  const total = items.length
  let nextIndex = 0
  let completed = 0

  async function runNext(): Promise<void> {
    const current = nextIndex++
    if (current >= items.length) return
    results[current] = await worker(items[current], current)
    completed++
    onProgress?.(completed, total)
    await runNext()
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length))
  await Promise.all(Array.from({ length: workerCount }, () => runNext()))
  return results
}

const PHOTO_SELECT = 'id,event_id,uploaded_by,storage_path,caption,upload_batch_id,created_at'

function publicUrlFor(supabase: SupabaseClient, storagePath: string): string {
  return supabase.storage.from('event-photos').getPublicUrl(storagePath).data.publicUrl
}

export interface UploadBatchResult {
  succeeded: AlbumPhoto[]
  failed: Array<{ name: string; message: string }>
}

// Extends the existing single-photo upload->insert->rollback-on-failure
// sequence to a concurrent batch, sharing one upload_batch_id and caption
// across the whole selection.
export async function uploadPhotoBatch(
  supabase: SupabaseClient,
  params: {
    eventId: string
    userId: string
    files: File[]
    caption: string
    onProgress?: (completed: number, total: number) => void
  }
): Promise<UploadBatchResult> {
  const batchId = crypto.randomUUID()
  const trimmedCaption = params.caption.trim() || null
  const succeeded: AlbumPhoto[] = []
  const failed: Array<{ name: string; message: string }> = []

  await runBatchWithConcurrency(
    params.files,
    UPLOAD_CONCURRENCY,
    async (file, index) => {
      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg'
      const path = `${params.eventId}/${Date.now()}-${params.userId}-${index}.${ext}`
      try {
        const { error: uploadError } = await supabase.storage
          .from('event-photos')
          .upload(path, file, { contentType: file.type || undefined })

        if (uploadError) {
          failed.push({ name: file.name, message: uploadError.message })
          return
        }

        const { data: inserted, error: insertError } = await supabase
          .from('event_photos')
          .insert({
            event_id: params.eventId,
            uploaded_by: params.userId,
            storage_path: path,
            caption: trimmedCaption,
            upload_batch_id: batchId,
          })
          .select(PHOTO_SELECT)
          .single()

        if (insertError || !inserted) {
          await supabase.storage.from('event-photos').remove([path])
          failed.push({ name: file.name, message: insertError?.message ?? 'Could not save that photo.' })
          return
        }

        const row = inserted as AlbumPhotoRow
        succeeded.push({ ...row, url: publicUrlFor(supabase, row.storage_path) })
      } catch (caught) {
        failed.push({ name: file.name, message: caught instanceof Error ? caught.message : 'Unexpected request failure' })
      }
    },
    params.onProgress
  )

  return { succeeded, failed }
}

export async function fetchAlbumPhotos(
  supabase: SupabaseClient,
  eventId: string
): Promise<{ photos: AlbumPhoto[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('event_photos')
      .select(PHOTO_SELECT)
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })

    if (error) return { photos: [], error: error.message }

    const rows = (data ?? []) as AlbumPhotoRow[]
    return {
      photos: rows.map((row) => ({ ...row, url: publicUrlFor(supabase, row.storage_path) })),
      error: null,
    }
  } catch (caught) {
    return { photos: [], error: caught instanceof Error ? caught.message : 'Unexpected request failure' }
  }
}

export async function fetchUsersByIds(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Record<string, AlbumUploader>> {
  const uniqueIds = Array.from(new Set(ids)).filter(Boolean)
  if (uniqueIds.length === 0) return {}

  const { data, error } = await supabase.from('users').select('id,name,photo_url').in('id', uniqueIds)
  if (error || !data) return {}

  return Object.fromEntries(
    (data as Array<{ id: string; name: string; photo_url: string | null }>).map((u) => [
      u.id,
      { id: u.id, name: u.name, photoUrl: u.photo_url },
    ])
  )
}

export async function fetchPhotoComments(
  supabase: SupabaseClient,
  photoId: string
): Promise<{ comments: PhotoComment[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('event_photo_comments')
      .select('id,photo_id,user_id,body,created_at')
      .eq('photo_id', photoId)
      .order('created_at', { ascending: true })

    if (error) return { comments: [], error: error.message }
    return { comments: (data ?? []) as PhotoComment[], error: null }
  } catch (caught) {
    return { comments: [], error: caught instanceof Error ? caught.message : 'Unexpected request failure' }
  }
}

export async function postPhotoComment(
  supabase: SupabaseClient,
  params: { photoId: string; userId: string; body: string }
): Promise<{ comment: PhotoComment | null; error: string | null }> {
  const trimmed = params.body.trim()
  if (!trimmed) return { comment: null, error: 'Comment cannot be empty.' }

  try {
    const { data, error } = await supabase
      .from('event_photo_comments')
      .insert({ photo_id: params.photoId, user_id: params.userId, body: trimmed })
      .select('id,photo_id,user_id,body,created_at')
      .single()

    if (error || !data) return { comment: null, error: error?.message ?? 'Could not post that comment.' }
    return { comment: data as PhotoComment, error: null }
  } catch (caught) {
    return { comment: null, error: caught instanceof Error ? caught.message : 'Unexpected request failure' }
  }
}
