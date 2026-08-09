'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SharedAlbumPage, type AlbumPhotoView } from '@/components/sofra-v2/SharedAlbumPage'
import type { UploadProgressState } from '@/components/sofra-v2/PhotoUploadProgress'
import type { PhotoCommentView } from '@/components/sofra-v2/PhotoComments'
import {
  fetchAlbumPhotos,
  fetchUsersByIds,
  fetchPhotoComments,
  postPhotoComment,
  uploadPhotoBatch,
  type AlbumUploader,
} from '@/lib/shared-album'
import '@/components/sofra-v2/sofra-v2.css'

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

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [comments, setComments] = useState<PhotoCommentView[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsError, setCommentsError] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)

  function decoratePhotos(rawPhotos: Awaited<ReturnType<typeof fetchAlbumPhotos>>['photos'], userMap: Record<string, AlbumUploader>): AlbumPhotoView[] {
    return rawPhotos.map((photo) => ({
      ...photo,
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
      if (foundIndex >= 0) setSelectedIndex(foundIndex)
    }
  }

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const stored = localStorage.getItem('sofra_user_id')
      if (!stored) {
        router.replace('/name?next=' + encodeURIComponent('/events/' + params.id + '/album'))
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

      await loadAlbum(ev.host_id === stored, rsvpRow !== null)
    } catch {
      setError("Couldn't load this album. Try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshAlbum() {
    if (!uidRef.current || !event) return
    await loadAlbum(event.host_id === uidRef.current, canUpload)
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

  function selectPhoto(index: number) {
    setSelectedIndex(index)
    setCommentsOpen(false)
  }

  function closeViewer() {
    setSelectedIndex(null)
    setCommentsOpen(false)
    setComments([])
  }

  async function toggleComments() {
    const next = !commentsOpen
    setCommentsOpen(next)
    if (next && selectedIndex !== null) {
      const photo = photos[selectedIndex]
      setCommentsLoading(true)
      setCommentsError('')
      const { comments: rows, error: commentsFetchError } = await fetchPhotoComments(supabase, photo.id)
      if (commentsFetchError) {
        setCommentsError('Could not load comments.')
        setCommentsLoading(false)
        return
      }
      const commenterMap = await fetchUsersByIds(supabase, rows.map((c) => c.user_id))
      setComments(
        rows.map((c) => ({
          id: c.id,
          body: c.body,
          createdAt: c.created_at,
          authorName: commenterMap[c.user_id]?.name ?? uploaders[c.user_id]?.name ?? 'Someone',
          authorPhotoUrl: commenterMap[c.user_id]?.photoUrl ?? uploaders[c.user_id]?.photoUrl ?? null,
        }))
      )
      setCommentsLoading(false)
    }
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
    setComments((current) => [
      ...current,
      {
        id: comment.id,
        body: comment.body,
        createdAt: comment.created_at,
        authorName: uploaders[uid]?.name ?? 'You',
        authorPhotoUrl: uploaders[uid]?.photoUrl ?? null,
      },
    ])
  }

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
      comments={comments}
      commentsLoading={commentsLoading}
      commentsError={commentsError}
      onSubmitComment={submitComment}
      submittingComment={submittingComment}
    />
  )
}
