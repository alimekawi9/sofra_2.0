'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SharedAlbumPage, type AlbumPhotoView } from '@/components/sofra-v2/SharedAlbumPage'
import type { UploadProgressState } from '@/components/sofra-v2/PhotoUploadProgress'
import type { SaveProgressState } from '@/components/sofra-v2/PhotoSaveProgress'
import type { PhotoCommentView } from '@/components/sofra-v2/PhotoComments'
import type { DeleteProgressState } from '@/components/sofra-v2/PhotoDeleteProgress'
import { isEventManager } from '@/lib/event-access'
import {
  fetchAlbumPhotos,
  fetchUsersByIds,
  fetchPhotoComments,
  postPhotoComment,
  uploadPhotoBatch,
  downloadPhotosBatch,
  saveViaShareSheet,
  deletePhoto,
  deletePhotoBatch,
  type AlbumUploader,
} from '@/lib/shared-album'
import '@/components/sofra-v2/sofra-v2.css'
import { loginDestination } from '@/lib/event-entry'

type EventRow = { id: string; host_id: string; title: string }

export default function EventAlbumPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const uidRef = useRef<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [event, setEvent] = useState<EventRow | null>(null)
  const [canUpload, setCanUpload] = useState(false)
  const [photos, setPhotos] = useState<AlbumPhotoView[]>([])
  const [uploaders, setUploaders] = useState<Record<string, AlbumUploader>>({})
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState | null>(null)

  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [saveProgress, setSaveProgress] = useState<SaveProgressState | null>(null)

  const [isHost, setIsHost] = useState(false)
  const [deleteProgress, setDeleteProgress] = useState<DeleteProgressState | null>(null)
  const [bulkDeleteError, setBulkDeleteError] = useState('')
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null)
  const [singleDeleteError, setSingleDeleteError] = useState('')

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [commentsOpen, setCommentsOpen] = useState(false)
  // Keyed by photo id so counts/lists never bleed between photos while
  // navigating, and revisiting a photo doesn't need to re-fetch.
  const [commentsByPhoto, setCommentsByPhoto] = useState<Record<string, PhotoCommentView[]>>({})
  const commentsByPhotoRef = useRef<Record<string, PhotoCommentView[]>>({})
  const [loadingCommentsFor, setLoadingCommentsFor] = useState<string | null>(null)
  const [commentsError, setCommentsError] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)

  function decoratePhotos(rawPhotos: Awaited<ReturnType<typeof fetchAlbumPhotos>>['photos'], userMap: Record<string, AlbumUploader>): AlbumPhotoView[] {
    return rawPhotos.map((photo) => ({
      ...photo,
      uploaderId: photo.uploaded_by,
      uploaderName: userMap[photo.uploaded_by]?.name ?? 'Someone',
      uploaderPhotoUrl: userMap[photo.uploaded_by]?.photoUrl ?? null,
    }))
  }

  async function loadAlbum(hostViewing: boolean, hasRsvp: boolean) {
    const unlocked = hostViewing || hasRsvp
    setCanUpload(unlocked)
    if (!unlocked) {
      setPhotos([])
      return
    }

    const { photos: rawPhotos, error: photosError } = await fetchAlbumPhotos(supabase, params.id)
    if (photosError) {
      setError('Could not load the album. Try again.')
      return
    }

    const userMap = await fetchUsersByIds(supabase, rawPhotos.map((p) => p.uploaded_by))
    setUploaders(userMap)
    const decorated = decoratePhotos(rawPhotos, userMap)
    setPhotos(decorated)

    const requestedPhotoId = searchParams.get('photo')
    if (requestedPhotoId) {
      const foundIndex = decorated.findIndex((p) => p.id === requestedPhotoId)
      if (foundIndex >= 0) {
        setSelectedIndex(foundIndex)
        ensureCommentsLoaded(decorated[foundIndex].id)
      }
    }
  }

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const stored = localStorage.getItem('sofra_user_id')
      if (!stored) {
        const query = searchParams.toString()
        router.replace(loginDestination(`/events/${params.id}/album${query ? `?${query}` : ''}`))
        return
      }
      uidRef.current = stored

      const { data: ev, error: e1 } = await supabase
        .from('events')
        .select('id,host_id,title')
        .eq('id', params.id)
        .single()

      if (e1) throw new Error('event not found')
      setEvent(ev as EventRow)

      const { data: rsvpRow, error: e2 } = await supabase
        .from('rsvps')
        .select('status')
        .eq('event_id', params.id)
        .eq('user_id', stored)
        .maybeSingle()

      if (e2) throw new Error('rsvp fetch failed')

      const hostViewing = await isEventManager(supabase, params.id, stored, ev.host_id)
      if (!hostViewing && rsvpRow === null) {
        router.replace(`/events/${params.id}/request-access`)
        return
      }
      setIsHost(hostViewing)
      await loadAlbum(hostViewing, rsvpRow !== null)
    } catch {
      setError("Couldn't load this album. Try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshAlbum() {
    if (!uidRef.current || !event) return
    await loadAlbum(isHost, canUpload)
  }

  function canDeletePhoto(photo: AlbumPhotoView): boolean {
    return isHost || photo.uploaded_by === uidRef.current
  }

  async function deleteCurrentPhoto() {
    if (selectedIndex === null) return
    const photo = photos[selectedIndex]
    if (!photo || !canDeletePhoto(photo)) return
    setDeletingPhotoId(photo.id)
    setSingleDeleteError('')
    const { ok, error: deleteErrorMessage } = await deletePhoto(supabase, { id: photo.id, storage_path: photo.storage_path })
    setDeletingPhotoId(null)
    if (!ok) {
      setSingleDeleteError(deleteErrorMessage ?? 'Could not delete that photo. Try again.')
      return
    }
    closeViewer()
    await refreshAlbum()
  }

  async function deleteSelected() {
    const deletable = photos.filter((p) => selectedIds.has(p.id) && canDeletePhoto(p))
    if (deletable.length === 0) {
      setBulkDeleteError('You can only delete your own photos.')
      return
    }
    setBulkDeleteError('')
    const total = deletable.length
    setDeleteProgress({ status: 'deleting', completed: 0, total })
    const { succeededCount, failedCount } = await deletePhotoBatch(
      supabase,
      deletable.map((p) => ({ id: p.id, storage_path: p.storage_path })),
      (completed, progressTotal) => setDeleteProgress({ status: 'deleting', completed, total: progressTotal })
    )
    setDeleteProgress({ status: 'done', succeededCount, failedCount, total })
    setSelectedIds(new Set())
    if (succeededCount > 0) await refreshAlbum()
  }

  async function handleFilesConfirmed(files: File[], caption: string) {
    if (!uidRef.current || files.length === 0) return
    setUploading(true)
    setUploadProgress({ status: 'uploading', completed: 0, total: files.length })

    const { succeeded, failed } = await uploadPhotoBatch(supabase, {
      eventId: params.id,
      userId: uidRef.current,
      files,
      caption,
      onProgress: (completed, total) => setUploadProgress({ status: 'uploading', completed, total }),
    })

    setUploading(false)

    if (failed.length === 0) {
      setUploadProgress({ status: 'success', total: succeeded.length })
    } else if (succeeded.length > 0) {
      setUploadProgress({
        status: 'partial',
        succeeded: succeeded.length,
        total: files.length,
        failedNames: failed.map((f) => f.name),
      })
    } else {
      setUploadProgress({ status: 'error', message: 'Could not upload those photos. Try again.' })
    }

    if (succeeded.length > 0) await refreshAlbum()
  }

  function setCommentsForPhoto(photoId: string, list: PhotoCommentView[]) {
    commentsByPhotoRef.current = { ...commentsByPhotoRef.current, [photoId]: list }
    setCommentsByPhoto(commentsByPhotoRef.current)
  }

  // Fetches once per photo id and caches — called on every navigation (not
  // just when the comments panel opens) so the count is known before the
  // user ever clicks the comment button.
  async function ensureCommentsLoaded(photoId: string) {
    if (commentsByPhotoRef.current[photoId] !== undefined) return
    setLoadingCommentsFor(photoId)
    setCommentsError('')
    const { comments: rows, error: commentsFetchError } = await fetchPhotoComments(supabase, photoId)
    if (commentsFetchError) {
      setCommentsError('Could not load comments.')
      setLoadingCommentsFor((current) => (current === photoId ? null : current))
      return
    }
    const commenterMap = await fetchUsersByIds(supabase, rows.map((c) => c.user_id))
    setCommentsForPhoto(
      photoId,
      rows.map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.created_at,
        authorId: c.user_id,
        authorName: commenterMap[c.user_id]?.name ?? uploaders[c.user_id]?.name ?? 'Someone',
        authorPhotoUrl: commenterMap[c.user_id]?.photoUrl ?? uploaders[c.user_id]?.photoUrl ?? null,
      }))
    )
    setLoadingCommentsFor((current) => (current === photoId ? null : current))
  }

  function selectPhoto(index: number) {
    setSelectedIndex(index)
    setCommentsOpen(false)
    const photo = photos[index]
    if (photo) ensureCommentsLoaded(photo.id)
  }

  function closeViewer() {
    setSelectedIndex(null)
    setCommentsOpen(false)
  }

  function toggleComments() {
    setCommentsOpen((open) => !open)
  }

  function toggleSelectMode() {
    setSelectMode((open) => !open)
    setSelectedIds(new Set())
  }

  function togglePhotoSelected(photoId: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(photoId)) next.delete(photoId)
      else next.add(photoId)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds((current) =>
      current.size === photos.length ? new Set() : new Set(photos.map((p) => p.id))
    )
  }

  async function saveSelected() {
    const toSave = photos.filter((p) => selectedIds.has(p.id))
    if (toSave.length === 0) return
    const targets = toSave.map((p) => ({ url: p.url, storage_path: p.storage_path }))
    setSaveProgress({ status: 'saving', completed: 0, total: targets.length })

    const shareResult = await saveViaShareSheet(targets, (completed, total) =>
      setSaveProgress({ status: 'saving', completed, total })
    )

    if (shareResult.unsupported) {
      // Falls back to a per-photo download on browsers without the Web Share
      // File API (e.g. desktop) -- saveViaShareSheet is the reliable path on
      // iOS Safari, where a synthetic <a download> just opens a bare file
      // preview instead of actually saving to Photos.
      const { succeededCount, failedCount } = await downloadPhotosBatch(
        targets,
        (completed, total) => setSaveProgress({ status: 'saving', completed, total })
      )
      setSaveProgress({ status: 'done', succeededCount, failedCount, total: targets.length })
      return
    }

    if (shareResult.aborted) {
      // The user closed the native share sheet without picking anything --
      // it already gave its own feedback, so there's nothing more to show.
      setSaveProgress(null)
      return
    }

    setSaveProgress(
      shareResult.ok
        ? { status: 'done', succeededCount: targets.length, failedCount: 0, total: targets.length }
        : { status: 'done', succeededCount: 0, failedCount: targets.length, total: targets.length }
    )
  }

  async function submitComment(body: string) {
    const uid = uidRef.current
    if (!uid || selectedIndex === null) return
    const photo = photos[selectedIndex]
    setSubmittingComment(true)
    setCommentsError('')
    const { comment, error: postError } = await postPhotoComment(supabase, {
      photoId: photo.id,
      userId: uid,
      body,
    })
    setSubmittingComment(false)
    if (postError || !comment) {
      setCommentsError('Could not post that comment. Try again.')
      return
    }
    setCommentsForPhoto(photo.id, [
      ...(commentsByPhotoRef.current[photo.id] ?? []),
      {
        id: comment.id,
        body: comment.body,
        createdAt: comment.created_at,
        authorId: uid,
        authorName: uploaders[uid]?.name ?? 'You',
        authorPhotoUrl: uploaders[uid]?.photoUrl ?? null,
      },
    ])
  }

  const currentPhotoId = selectedIndex !== null ? (photos[selectedIndex]?.id ?? null) : null
  const currentComments = currentPhotoId !== null ? commentsByPhoto[currentPhotoId] : undefined
  const commentsLoading = currentPhotoId !== null && loadingCommentsFor === currentPhotoId

  return (
    <SharedAlbumPage
      loading={loading}
      error={error}
      onRetry={loadData}
      backHref={'/events/' + params.id}
      eventTitle={event?.title ?? ''}
      photos={photos}
      selectedIndex={selectedIndex}
      onSelectPhoto={selectPhoto}
      onCloseViewer={closeViewer}
      canUpload={canUpload}
      uploading={uploading}
      uploadProgress={uploadProgress}
      onDismissProgress={() => setUploadProgress(null)}
      onFilesConfirmed={handleFilesConfirmed}
      commentsOpen={commentsOpen}
      onToggleComments={toggleComments}
      comments={currentComments ?? []}
      commentCount={currentComments ? currentComments.length : null}
      commentsLoading={commentsLoading}
      commentsError={commentsError}
      onSubmitComment={submitComment}
      submittingComment={submittingComment}
      selectMode={selectMode}
      selectedIds={selectedIds}
      onToggleSelectMode={toggleSelectMode}
      onTogglePhotoSelected={togglePhotoSelected}
      onToggleSelectAll={toggleSelectAll}
      onSaveSelected={saveSelected}
      saveProgress={saveProgress}
      onDismissSaveProgress={() => setSaveProgress(null)}
      canDeleteCurrent={selectedIndex !== null && photos[selectedIndex] ? canDeletePhoto(photos[selectedIndex]) : false}
      deletingCurrent={selectedIndex !== null && photos[selectedIndex] ? deletingPhotoId === photos[selectedIndex].id : false}
      onDeleteCurrent={deleteCurrentPhoto}
      singleDeleteError={singleDeleteError}
      onDeleteSelected={deleteSelected}
      deleteProgress={deleteProgress}
      onDismissDeleteProgress={() => setDeleteProgress(null)}
      bulkDeleteError={bulkDeleteError}
    />
  )
}
