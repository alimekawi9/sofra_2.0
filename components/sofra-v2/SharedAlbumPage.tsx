'use client'

import Link from 'next/link'
import { sv2Display, sv2Sans } from './fonts'
import { AddPhotosControl } from './AddPhotosControl'
import { PhotoUploadProgress, uploadTransitionLabel, type UploadProgressState } from './PhotoUploadProgress'
import { PhotoSaveProgress, type SaveProgressState } from './PhotoSaveProgress'
import { PhotoViewer } from './PhotoViewer'
import SofraTransition from '../SofraTransition'
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
  selectMode: boolean
  selectedIds: Set<string>
  onToggleSelectMode: () => void
  onTogglePhotoSelected: (id: string) => void
  onToggleSelectAll: () => void
  onSaveSelected: () => void
  saveProgress: SaveProgressState | null
  onDismissSaveProgress: () => void
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
  selectMode,
  selectedIds,
  onToggleSelectMode,
  onTogglePhotoSelected,
  onToggleSelectAll,
  onSaveSelected,
  saveProgress,
  onDismissSaveProgress,
}: SharedAlbumPageProps) {
  const allSelected = photos.length > 0 && selectedIds.size === photos.length
  const saving = saveProgress?.status === 'saving'
  return (
    <div className={`sv2-root sv2-device-page sv2-app-page ${sv2Display.variable} ${sv2Sans.variable}`}>
      <main className="sv2-device-shell sv2-app-shell sv2-album-page-shell">
        <Link className="sv2-back-link" href={backHref}>← Back</Link>

        <header className="sv2-album-page-header">
          <h1>Shared Album</h1>
          <p className="sv2-album-page-subtitle">{eventTitle}</p>
          <div className="sv2-album-page-meta">
            <span>{photos.length} {photos.length === 1 ? 'memory' : 'memories'}</span>
            <div className="sv2-album-heading-actions">
              {photos.length > 0 && !selectMode && (
                <button type="button" className="sv2-album-select-toggle-btn" onClick={onToggleSelectMode}>SELECT</button>
              )}
              {canUpload && (
                <AddPhotosControl disabled={uploading} currentCount={photos.length} onFilesConfirmed={onFilesConfirmed} />
              )}
            </div>
          </div>
          {selectMode && (
            <div className="sv2-album-download-row">
              <button
                type="button"
                className="sv2-album-download-btn"
                onClick={onSaveSelected}
                disabled={selectedIds.size === 0 || saving}
                aria-label="Save selected photos"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3v12" />
                  <path d="M7 10l5 5 5-5" />
                  <path d="M5 21h14" />
                </svg>
              </button>
            </div>
          )}
          {selectMode && (
            <div className="sv2-album-select-toolbar">
              <button type="button" className="sv2-album-select-all-btn" onClick={onToggleSelectAll}>
                {allSelected ? 'DESELECT ALL' : 'SELECT ALL'}
              </button>
              <span>{selectedIds.size} selected</span>
            </div>
          )}
          {selectMode && (
            <button type="button" className="sv2-album-cancel-btn" onClick={onToggleSelectMode}>CANCEL</button>
          )}
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
            {photos.map((photo, i) => {
              const isSelected = selectedIds.has(photo.id)
              return (
                <button
                  key={photo.id}
                  type="button"
                  className={`sv2-album-page-tile${selectMode ? ' sv2-album-tile-selectable' : ''}`}
                  onClick={() => (selectMode ? onTogglePhotoSelected(photo.id) : onSelectPhoto(i))}
                  aria-label={
                    selectMode
                      ? `${isSelected ? 'Deselect' : 'Select'} photo ${i + 1} of ${photos.length}`
                      : `Open photo ${i + 1} of ${photos.length}`
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt="" loading="lazy" />
                  {selectMode && (
                    <span className={`sv2-album-tile-checkbox${isSelected ? ' is-checked' : ''}`} aria-hidden="true">
                      {isSelected ? '✓' : ''}
                    </span>
                  )}
                </button>
              )
            })}
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
      <PhotoSaveProgress state={saveProgress} onDismiss={onDismissSaveProgress} />
      <SofraTransition active={uploading} label={uploadTransitionLabel(uploadProgress)} />
    </div>
  )
}
