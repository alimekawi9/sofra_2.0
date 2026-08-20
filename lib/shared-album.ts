import type { SupabaseClient } from '@supabase/supabase-js'

export const MAX_PREVIEW_TILES = 6
// Per-upload-action limit -- how many files one person can select and
// upload in a single batch. Independent of the whole album's size.
export const MAX_UPLOAD_BATCH = 20
// Total cap for the whole shared album across every guest's uploads.
// validateUploadBatch checks a new batch against remaining room under this
// cap (existingCount + fileCount), separately from the per-batch limit above.
export const MAX_ALBUM_PHOTOS = 200
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
  if (fileCount > MAX_UPLOAD_BATCH) {
    return { ok: false, message: `You can upload up to ${MAX_UPLOAD_BATCH} photos at a time.` }
  }
  const remaining = MAX_ALBUM_PHOTOS - existingCount
  if (fileCount > remaining) {
    if (remaining <= 0) {
      return { ok: false, message: `This album is full — up to ${MAX_ALBUM_PHOTOS} photos per event.` }
    }
    return {
      ok: false,
      message: `You can only add ${remaining} more ${remaining === 1 ? 'photo' : 'photos'} — up to ${MAX_ALBUM_PHOTOS} per event.`,
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

export interface DeletePhotoResult {
  ok: boolean
  error?: string
}

// Storage-then-row, in that order: a dangling storage file is a harmless
// orphan, but a DB row pointing at a file the UI still shows is the worse
// failure mode, so the row delete is what determines success/failure here.
// Photo comments cascade-delete automatically via event_photo_comments'
// existing `on delete cascade` foreign key.
export async function deletePhoto(
  supabase: SupabaseClient,
  photo: { id: string; storage_path: string }
): Promise<DeletePhotoResult> {
  try {
    await supabase.storage.from('event-photos').remove([photo.storage_path])
    const { error } = await supabase.from('event_photos').delete().eq('id', photo.id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (caught) {
    return { ok: false, error: caught instanceof Error ? caught.message : 'Unexpected request failure' }
  }
}

export interface DeleteBatchResult {
  succeededCount: number
  failedCount: number
}

export async function deletePhotoBatch(
  supabase: SupabaseClient,
  photos: Array<{ id: string; storage_path: string }>,
  onProgress?: (completed: number, total: number) => void
): Promise<DeleteBatchResult> {
  const results = await runBatchWithConcurrency(
    photos,
    UPLOAD_CONCURRENCY,
    (photo) => deletePhoto(supabase, photo),
    onProgress
  )
  return {
    succeededCount: results.filter((r) => r.ok).length,
    failedCount: results.filter((r) => !r.ok).length,
  }
}

export function filenameForDownload(storagePath: string): string {
  const parts = storagePath.split('/')
  return parts[parts.length - 1] || 'photo.jpg'
}

// Photos live on Supabase Storage's own domain, not the app's origin, so a
// plain <a download href={url}> would just navigate to the image instead of
// saving it -- the download attribute is only honored same-origin. Fetching
// the image into a blob first and downloading that blob: URL works around
// that restriction.
export async function downloadPhotoToDevice(photo: { url: string; storage_path: string }): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(photo.url)
    if (!response.ok) return { ok: false, error: 'Could not download that photo.' }
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = filenameForDownload(photo.storage_path)
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
    return { ok: true }
  } catch (caught) {
    return { ok: false, error: caught instanceof Error ? caught.message : 'Unexpected download failure' }
  }
}

export async function buildDownloadableFile(photo: { url: string; storage_path: string }): Promise<File | null> {
  try {
    const response = await fetch(photo.url)
    if (!response.ok) return null
    const blob = await response.blob()
    return new File([blob], filenameForDownload(photo.storage_path), { type: blob.type || 'image/jpeg' })
  } catch {
    return null
  }
}

export interface ShareSaveResult {
  ok: boolean
  aborted?: boolean
  unsupported?: boolean
  error?: string
}

// The reliable way to get photos into the camera roll on iOS Safari: a
// synthetic <a download> there just opens an unnamed file preview instead of
// actually saving anything (the download attribute isn't honored the same
// way it is on desktop). Handing real File objects to the OS's native share
// sheet gives the standard "Save Image(s)" flow instead.
export async function saveViaShareSheet(
  photos: Array<{ url: string; storage_path: string }>,
  onProgress?: (completed: number, total: number) => void
): Promise<ShareSaveResult> {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.share !== 'function' ||
    typeof navigator.canShare !== 'function'
  ) {
    return { ok: false, unsupported: true }
  }

  const files = (
    await runBatchWithConcurrency(photos, UPLOAD_CONCURRENCY, buildDownloadableFile, onProgress)
  ).filter((file): file is File => file !== null)

  if (files.length === 0) return { ok: false, error: 'Could not prepare those photos.' }
  if (!navigator.canShare({ files })) return { ok: false, unsupported: true }

  try {
    await navigator.share({ files })
    return { ok: true }
  } catch (caught) {
    // The user closing the share sheet without picking anything isn't a failure.
    if (caught instanceof Error && caught.name === 'AbortError') return { ok: true, aborted: true }
    return { ok: false, error: caught instanceof Error ? caught.message : 'Could not save those photos.' }
  }
}

export interface DownloadBatchResult {
  succeededCount: number
  failedCount: number
}

// Sequential, not concurrent like uploadPhotoBatch/runBatchWithConcurrency --
// firing many blob-download clicks in a tight concurrent burst is more likely
// to trip a browser's "site is downloading multiple files" prompt than one
// at a time, and there's no real throughput benefit here since each step is
// just a fetch plus a synchronous DOM click.
export async function downloadPhotosBatch(
  photos: Array<{ url: string; storage_path: string }>,
  onProgress?: (completed: number, total: number) => void
): Promise<DownloadBatchResult> {
  let succeededCount = 0
  let failedCount = 0
  for (let i = 0; i < photos.length; i++) {
    const result = await downloadPhotoToDevice(photos[i])
    if (result.ok) succeededCount++
    else failedCount++
    onProgress?.(i + 1, photos.length)
  }
  return { succeededCount, failedCount }
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
