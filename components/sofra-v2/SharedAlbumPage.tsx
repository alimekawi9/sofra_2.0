'use client'

import Link from 'next/link'
import { sv2Display, sv2Sans } from './fonts'
import { AddPhotosControl } from './AddPhotosControl'
import { PhotoUploadProgress, type UploadProgressState } from './PhotoUploadProgress'
import { PhotoViewer } from './PhotoViewer'
import type { PhotoCommentView } from './PhotoComments'
import type { AlbumPhoto } from '@/lib/shared-album'

export interface AlbumPhotoView extends AlbumPhoto {
  uploaderName: string
  uploaderPhotoUrl: string | null
}

export interface SharedAlbumPageProps {
  loading: boolean
  error: string
  onRetry: () => void
  backHref: string
  eventTitle: string
  photos: AlbumPhotoView[]
  selectedIndex: number | null
  onSelectPhoto: (index: number) => void
  onCloseViewer: () => void
  canUpload: boolean
  uploading: boolean
  uploadProgress: UploadProgressState | null
  onDismissProgress: () => void
  onFilesConfirmed: (files: File[], caption: string) => void
  commentsOpen: boolean
  onToggleComments: () => void
  comments: PhotoCommentView[]
  commentCount: number | null
  commentsLoading: boolean
  commentsError: string
  onSubmitComment: (body: string) => void
  submittingComment: boolean
}

export function SharedAlbumPage({
  loading,
  error,
  onRetry,
  backHref,
  eventTitle,
  photos,
  selectedIndex,
  onSelectPhoto,
  onCloseViewer,
  canUpload,
  uploading,
  uploadProgress,
  onDismissProgress,
  onFilesConfirmed,
  commentsOpen,
  onToggleComments,
  comments,
  commentCount,
  commentsLoading,
  commentsError,
  onSubmitComment,
  submittingComment,
}: SharedAlbumPageProps) {
  return (
    <div className={`sv2-root sv2-device-page sv2-app-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-device-shell sv2-app-shell sv2-album-page-shell">
        <Link className="sv2-back-link" href={backHref}>← Back</Link>

        <header className="sv2-album-page-header">
          <h1>Shared Album</h1>
          <p className="sv2-album-page-subtitle">{eventTitle}</p>
          <div className="sv2-album-page-meta">
            <span>{photos.length} {photos.length === 1 ? 'memory' : 'memories'}</span>
            {canUpload && (
              <AddPhotosControl disabled={uploading} onFilesConfirmed={onFilesConfirmed} />
            )}
          </div>
        </header>

        {loading ? (
          <p style={{ fontSize: 13 }}>Loading…</p>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <p style={{ fontSize: 13, marginBottom: 12 }}>{error}</p>
            <button type="button" onClick={onRetry}>Retry</button>
          </div>
        ) : photos.length === 0 ? (
          <p style={{ fontSize: 12 }}>No memories yet.</p>
        ) : (
          <div className="sv2-album-page-grid">
            {photos.map((photo, i) => (
              <button
                key={photo.id}
                type="button"
                className="sv2-album-page-tile"
                onClick={() => onSelectPhoto(i)}
                aria-label={`Open photo ${i + 1} of ${photos.length}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </main>

      {selectedIndex !== null && photos[selectedIndex] && (
        <PhotoViewer
          photos={photos.map((p) => ({
            id: p.id,
            url: p.url,
            caption: p.caption,
            uploaderId: p.uploaded_by,
            uploaderName: p.uploaderName,
            uploaderPhotoUrl: p.uploaderPhotoUrl,
            createdAt: p.created_at,
          }))}
          index={selectedIndex}
          onIndexChange={onSelectPhoto}
          onClose={onCloseViewer}
          commentsOpen={commentsOpen}
          onToggleComments={onToggleComments}
          comments={comments}
          commentCount={commentCount}
          commentsLoading={commentsLoading}
          commentsError={commentsError}
          onSubmitComment={onSubmitComment}
          submittingComment={submittingComment}
        />
      )}

      <PhotoUploadProgress state={uploadProgress} onDismiss={onDismissProgress} />
    </div>
  )
}
