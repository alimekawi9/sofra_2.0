'use client'

import { useEffect, useRef, useState } from 'react'
import { ProfileIdentityLink } from './ProfileIdentityLink'
import { PhotoComments, type PhotoCommentView } from './PhotoComments'
import { timeAgo } from '@/lib/sofra/format'

export interface PhotoViewerPhoto {
  id: string
  url: string
  caption: string | null
  uploaderName: string
  uploaderId: string
  uploaderPhotoUrl: string | null
  createdAt: string
}

export interface PhotoViewerProps {
  photos: PhotoViewerPhoto[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
  commentsOpen: boolean
  onToggleComments: () => void
  comments: PhotoCommentView[]
  commentCount: number | null
  commentsLoading: boolean
  commentsError: string
  onSubmitComment: (body: string) => void
  submittingComment: boolean
  canDelete: boolean
  deleting: boolean
  onDelete: () => void
  deleteError: string
}

const SWIPE_THRESHOLD = 50

// null = not yet known (still loading) — never claim "Add a comment" then.
function commentButtonLabel(commentsOpen: boolean, count: number | null): string {
  if (commentsOpen) return 'CLOSE COMMENTS'
  if (count === null) return '💬'
  if (count === 0) return '💬 ADD A COMMENT'
  if (count === 1) return '💬 1 COMMENT'
  return `💬 ${count} COMMENTS`
}

function commentButtonAriaLabel(commentsOpen: boolean, count: number | null): string {
  if (commentsOpen) return 'Hide comments'
  if (count === null) return 'Comments'
  if (count === 0) return 'Add a comment'
  return `View ${count} comment${count === 1 ? '' : 's'}`
}

export function PhotoViewer({
  photos,
  index,
  onIndexChange,
  onClose,
  commentsOpen,
  onToggleComments,
  comments,
  commentCount,
  commentsLoading,
  commentsError,
  onSubmitComment,
  submittingComment,
  canDelete,
  deleting,
  onDelete,
  deleteError,
}: PhotoViewerProps) {
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const photo = photos[index]

  function goNext() {
    onIndexChange((index + 1) % photos.length)
  }

  function goPrev() {
    onIndexChange((index - 1 + photos.length) % photos.length)
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, photos.length])

  useEffect(() => {
    setConfirmingDelete(false)
  }, [index])

  if (!photo) return null

  function handlePointerDown(e: React.PointerEvent) {
    dragStart.current = { x: e.clientX, y: e.clientY }
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!dragStart.current) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    dragStart.current = null
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return
    if (dx < 0) goNext()
    else goPrev()
  }

  return (
    <div className="sv2-photo-viewer" role="dialog" aria-label="Photo viewer" aria-modal="true">
      <div className="sv2-photo-viewer-top">
        <button type="button" aria-label="Close" onClick={onClose}>✕</button>
        <span>{index + 1} of {photos.length}</span>
        <span aria-hidden="true" />
      </div>

      <div
        className="sv2-photo-viewer-stage"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        {photos.length > 1 && (
          <button type="button" className="sv2-photo-viewer-prev" aria-label="Previous photo" onClick={goPrev}>‹</button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url} alt="" />
        {photos.length > 1 && (
          <button type="button" className="sv2-photo-viewer-next" aria-label="Next photo" onClick={goNext}>›</button>
        )}
      </div>

      <div className="sv2-photo-viewer-bottom">
        <div className="sv2-photo-viewer-attribution">
          <ProfileIdentityLink userId={photo.uploaderId} name={photo.uploaderName} photoUrl={photo.uploaderPhotoUrl} />
          <div>
            <p className="sv2-photo-viewer-uploader">{timeAgo(photo.createdAt)}</p>
            {photo.caption && <p className="sv2-photo-viewer-caption">{photo.caption}</p>}
          </div>
        </div>
        <div className="sv2-photo-viewer-actions">
          {canDelete && (
            confirmingDelete ? (
              <div className="sv2-photo-viewer-delete-confirm">
                <span>Delete this photo?</span>
                <button type="button" disabled={deleting} onClick={onDelete}>
                  {deleting ? 'DELETING…' : 'YES, DELETE'}
                </button>
                <button type="button" onClick={() => setConfirmingDelete(false)}>CANCEL</button>
              </div>
            ) : (
              <button type="button" className="sv2-photo-viewer-delete-btn" onClick={() => setConfirmingDelete(true)}>
                DELETE
              </button>
            )
          )}
          <button
            type="button"
            className="sv2-photo-viewer-comment-toggle"
            onClick={onToggleComments}
            aria-label={commentButtonAriaLabel(commentsOpen, commentCount)}
          >
            {commentButtonLabel(commentsOpen, commentCount)}
          </button>
        </div>
      </div>
      {deleteError && <p role="alert" className="sv2-photo-viewer-delete-error">{deleteError}</p>}

      <PhotoComments
        open={commentsOpen}
        onClose={onToggleComments}
        loading={commentsLoading}
        comments={comments}
        error={commentsError}
        onSubmit={onSubmitComment}
        submitting={submittingComment}
      />
    </div>
  )
}
