'use client'

import { useState } from 'react'
import { AlbumAvatar } from './AlbumAvatar'
import { timeAgo } from '@/lib/sofra/format'

export interface PhotoCommentView {
  id: string
  body: string
  createdAt: string
  authorName: string
  authorPhotoUrl: string | null
}

export interface PhotoCommentsProps {
  open: boolean
  onClose: () => void
  loading: boolean
  comments: PhotoCommentView[]
  onSubmit: (body: string) => void
  submitting: boolean
  error: string
}

export function PhotoComments({ open, onClose, loading, comments, onSubmit, submitting, error }: PhotoCommentsProps) {
  const [draft, setDraft] = useState('')

  if (!open) return null

  function submit() {
    const trimmed = draft.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    setDraft('')
  }

  return (
    <div className="sv2-comments-panel" role="dialog" aria-label="Comments">
      <div className="sv2-comments-header">
        <span>COMMENTS</span>
        <button type="button" aria-label="Close comments" onClick={onClose}>✕</button>
      </div>

      <div className="sv2-comments-list">
        {loading ? (
          <p className="sv2-comments-empty">Loading…</p>
        ) : comments.length === 0 ? (
          <p className="sv2-comments-empty">No comments yet.</p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="sv2-comment-row">
              <AlbumAvatar name={comment.authorName} photoUrl={comment.authorPhotoUrl} />
              <div>
                <p className="sv2-comment-meta">
                  {comment.authorName} · {timeAgo(comment.createdAt)}
                </p>
                <p className="sv2-comment-body">{comment.body}</p>
              </div>
            </div>
          ))
        )}
        {error && <p role="alert" className="sv2-comments-error">{error}</p>}
      </div>

      <div className="sv2-comments-compose">
        <input
          aria-label="Add a comment"
          value={draft}
          placeholder="Add a comment…"
          maxLength={500}
          disabled={submitting}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        />
        <button type="button" disabled={submitting || draft.trim().length === 0} onClick={submit}>
          POST
        </button>
      </div>
    </div>
  )
}
