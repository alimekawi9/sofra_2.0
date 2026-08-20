# Photo Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a photo's uploader, or the event host, delete a Shared Album photo — from the full-screen viewer (one at a time) and from the existing SELECT mode (in bulk) — with an inline two-step confirm before anything is actually removed.

**Architecture:** Two new pure functions in `lib/shared-album.ts` (`deletePhoto`, `deletePhotoBatch`) handle the Storage-object-then-row deletion (comments cascade automatically via the existing FK). Permission (`uploader === viewer` or `viewer === host`) is computed once in `app/(guest)/events/[id]/album/page.tsx` and passed down as plain booleans/callbacks — `PhotoViewer` and `SharedAlbumPage` never re-derive identity themselves, they just render what they're told and manage their own local two-step-confirm UI state (mirroring the existing `confirmingGuestId` pattern already used for removing a guest in `EventPaper`). A new `PhotoDeleteProgress` component mirrors the existing `PhotoSaveProgress` exactly for the bulk-delete result banner.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase (Storage + Postgres), Jest + Testing Library.

---

### Task 1: `deletePhoto` and `deletePhotoBatch` in `lib/shared-album.ts`

**Files:**
- Modify: `lib/shared-album.ts`
- Modify: `__tests__/shared-album.test.ts`

- [ ] **Step 1: Write the failing tests**

In `__tests__/shared-album.test.ts`, add `deletePhoto` and `deletePhotoBatch` to the existing import list from `@/lib/shared-album`.

Extend `makeFakeSupabase`'s `overrides` type and destructure to add:

```ts
  deleteResults?: Array<{ error: any }>
```

and in the destructure block:

```ts
  const {
    photoRows = [],
    photoFetchError = null,
    insertResults = [],
    uploadResults = [],
    removeCalls = [],
    usersRows = [],
    commentRows = [],
    commentInsertResult = { data: null, error: null },
    deleteResults = [],
  } = overrides
```

Add this counter right after `let uploadCallIndex = 0`:

```ts
  let deleteCallIndex = 0
```

In the `event_photos` branch of `from`, add a `delete` method alongside the existing `select`/`insert`:

```ts
      if (table === 'event_photos') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({ data: photoRows, error: photoFetchError }),
            }),
          }),
          insert: jest.fn().mockImplementation(() => ({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockImplementation(async () => {
                const result = insertResults[insertCallIndex] ?? { data: null, error: { message: 'no mock result' } }
                insertCallIndex++
                return result
              }),
            }),
          })),
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockImplementation(async () => {
              const result = deleteResults[deleteCallIndex] ?? { error: null }
              deleteCallIndex++
              return result
            }),
          }),
        }
      }
```

Add this new `describe` block right after the closing of `describe('uploadPhotoBatch', ...)`:

```ts
describe('deletePhoto', () => {
  it('removes the storage object then deletes the row, in that order', async () => {
    const sb = makeFakeSupabase({ deleteResults: [{ error: null }] })
    const result = await deletePhoto(sb, { id: 'p1', storage_path: 'ev-1/a.jpg' })
    expect(result.ok).toBe(true)
    expect(sb._bucket.remove).toHaveBeenCalledWith(['ev-1/a.jpg'])
    const deleteMock = sb.from('event_photos').delete as jest.Mock
    expect(deleteMock).toHaveBeenCalled()
  })

  it('still deletes the row even if the storage removal itself errors', async () => {
    const sb = makeFakeSupabase({ deleteResults: [{ error: null }] })
    sb._bucket.remove.mockResolvedValueOnce({ data: null, error: { message: 'not found' } })
    const result = await deletePhoto(sb, { id: 'p1', storage_path: 'ev-1/a.jpg' })
    expect(result.ok).toBe(true)
  })

  it('reports failure when the row delete errors', async () => {
    const sb = makeFakeSupabase({ deleteResults: [{ error: { message: 'db error' } }] })
    const result = await deletePhoto(sb, { id: 'p1', storage_path: 'ev-1/a.jpg' })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('db error')
  })
})

describe('deletePhotoBatch', () => {
  it('reports full success when every delete succeeds', async () => {
    const sb = makeFakeSupabase({ deleteResults: [{ error: null }, { error: null }] })
    const result = await deletePhotoBatch(sb, [
      { id: 'p1', storage_path: 'ev-1/a.jpg' },
      { id: 'p2', storage_path: 'ev-1/b.jpg' },
    ])
    expect(result).toEqual({ succeededCount: 2, failedCount: 0 })
  })

  it('reports a partial result when some deletes fail', async () => {
    const sb = makeFakeSupabase({ deleteResults: [{ error: null }, { error: { message: 'denied' } }] })
    const result = await deletePhotoBatch(sb, [
      { id: 'p1', storage_path: 'ev-1/a.jpg' },
      { id: 'p2', storage_path: 'ev-1/b.jpg' },
    ])
    expect(result).toEqual({ succeededCount: 1, failedCount: 1 })
  })

  it('reports real completed/total progress as each delete finishes', async () => {
    const sb = makeFakeSupabase({ deleteResults: [{ error: null }, { error: null }] })
    const progress: Array<[number, number]> = []
    await deletePhotoBatch(
      sb,
      [{ id: 'p1', storage_path: 'ev-1/a.jpg' }, { id: 'p2', storage_path: 'ev-1/b.jpg' }],
      (completed, total) => progress.push([completed, total])
    )
    expect(progress).toEqual([[1, 2], [2, 2]])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/shared-album.test.ts -t "deletePhoto"`
Expected: FAIL with "deletePhoto is not a function" / "deletePhotoBatch is not a function"

- [ ] **Step 3: Write the implementation**

In `lib/shared-album.ts`, add right after `fetchAlbumPhotos`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/shared-album.test.ts`
Expected: PASS (all tests, including the 6 new ones)

- [ ] **Step 5: Commit**

```bash
git add lib/shared-album.ts __tests__/shared-album.test.ts
git commit -m "Add deletePhoto and deletePhotoBatch to lib/shared-album"
```

---

### Task 2: `PhotoDeleteProgress` component

**Files:**
- Create: `components/sofra-v2/PhotoDeleteProgress.tsx`
- Test: `__tests__/photo-delete-progress.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { PhotoDeleteProgress } from '@/components/sofra-v2/PhotoDeleteProgress'

it('renders nothing when state is null', () => {
  const { container } = render(<PhotoDeleteProgress state={null} onDismiss={jest.fn()} />)
  expect(container).toBeEmptyDOMElement()
})

it('shows a progress bar while deleting', () => {
  render(<PhotoDeleteProgress state={{ status: 'deleting', completed: 1, total: 4 }} onDismiss={jest.fn()} />)
  expect(screen.getByText('Deleting photos')).toBeInTheDocument()
  expect(screen.getByText('1 of 4')).toBeInTheDocument()
})

it('shows a plural success message with no failures', () => {
  render(<PhotoDeleteProgress state={{ status: 'done', succeededCount: 3, failedCount: 0, total: 3 }} onDismiss={jest.fn()} />)
  expect(screen.getByText('3 photos deleted')).toBeInTheDocument()
})

it('shows a singular success message for exactly one photo', () => {
  render(<PhotoDeleteProgress state={{ status: 'done', succeededCount: 1, failedCount: 0, total: 1 }} onDismiss={jest.fn()} />)
  expect(screen.getByText('1 photo deleted')).toBeInTheDocument()
})

it('shows a partial-failure message', () => {
  render(<PhotoDeleteProgress state={{ status: 'done', succeededCount: 2, failedCount: 1, total: 3 }} onDismiss={jest.fn()} />)
  expect(screen.getByText('2 of 3 deleted')).toBeInTheDocument()
  expect(screen.getByText(/1 couldn.t be deleted/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/photo-delete-progress.test.tsx`
Expected: FAIL with "Cannot find module '@/components/sofra-v2/PhotoDeleteProgress'"

- [ ] **Step 3: Write the implementation**

```tsx
'use client'

export type DeleteProgressState =
  | { status: 'deleting'; completed: number; total: number }
  | { status: 'done'; succeededCount: number; failedCount: number; total: number }

export interface PhotoDeleteProgressProps {
  state: DeleteProgressState | null
  onDismiss: () => void
}

export function PhotoDeleteProgress({ state, onDismiss }: PhotoDeleteProgressProps) {
  if (!state) return null

  const percent =
    state.status === 'deleting'
      ? Math.round((state.completed / state.total) * 100)
      : 100

  return (
    <div className="sv2-upload-progress" role="status" aria-live="polite">
      <div className="sv2-upload-progress-head">
        <span>
          {state.status === 'deleting' && 'Deleting photos'}
          {state.status === 'done' && state.failedCount === 0 &&
            `${state.succeededCount} ${state.succeededCount === 1 ? 'photo' : 'photos'} deleted`}
          {state.status === 'done' && state.failedCount > 0 && `${state.succeededCount} of ${state.total} deleted`}
        </span>
        {state.status === 'done' && (
          <button type="button" aria-label="Dismiss" onClick={onDismiss}>✕</button>
        )}
      </div>

      {state.status === 'deleting' && (
        <>
          <p>{state.completed} of {state.total}</p>
          <div className="sv2-upload-progress-bar">
            <span style={{ width: `${percent}%` }} />
          </div>
        </>
      )}

      {state.status === 'done' && state.failedCount > 0 && (
        <p>{state.failedCount} couldn&rsquo;t be deleted — you can only delete your own photos.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/photo-delete-progress.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add components/sofra-v2/PhotoDeleteProgress.tsx __tests__/photo-delete-progress.test.tsx
git commit -m "Add PhotoDeleteProgress component"
```

---

### Task 3: Delete button in `PhotoViewer`

**Files:**
- Modify: `components/sofra-v2/PhotoViewer.tsx`
- Modify: `components/sofra-v2/sofra-v2.css`
- Create: `__tests__/photo-viewer.test.tsx` (confirmed not to already exist)

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhotoViewer, type PhotoViewerPhoto } from '@/components/sofra-v2/PhotoViewer'

const PHOTOS: PhotoViewerPhoto[] = [
  { id: 'p1', url: 'https://example.test/a.jpg', caption: null, uploaderName: 'Ali', uploaderId: 'uid-1', uploaderPhotoUrl: null, createdAt: '2026-08-01T12:00:00Z' },
  { id: 'p2', url: 'https://example.test/b.jpg', caption: null, uploaderName: 'Alia', uploaderId: 'uid-2', uploaderPhotoUrl: null, createdAt: '2026-08-01T12:00:00Z' },
]

function baseProps(overrides: Partial<React.ComponentProps<typeof PhotoViewer>> = {}) {
  return {
    photos: PHOTOS,
    index: 0,
    onIndexChange: jest.fn(),
    onClose: jest.fn(),
    commentsOpen: false,
    onToggleComments: jest.fn(),
    comments: [],
    commentCount: 0,
    commentsLoading: false,
    commentsError: '',
    onSubmitComment: jest.fn(),
    submittingComment: false,
    canDelete: false,
    deleting: false,
    onDelete: jest.fn(),
    deleteError: '',
    ...overrides,
  }
}

describe('PhotoViewer delete', () => {
  it('does not show a DELETE button when canDelete is false', () => {
    render(<PhotoViewer {...baseProps({ canDelete: false })} />)
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
  })

  it('shows a DELETE button when canDelete is true', () => {
    render(<PhotoViewer {...baseProps({ canDelete: true })} />)
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
  })

  it('requires a second confirm click before calling onDelete', async () => {
    const onDelete = jest.fn()
    render(<PhotoViewer {...baseProps({ canDelete: true, onDelete })} />)
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByText(/delete this photo/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /yes, delete/i }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('CANCEL backs out of the confirm step without calling onDelete', async () => {
    const onDelete = jest.fn()
    render(<PhotoViewer {...baseProps({ canDelete: true, onDelete })} />)
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
  })

  it('shows deleteError inline when present', () => {
    render(<PhotoViewer {...baseProps({ canDelete: true, deleteError: 'Could not delete that photo. Try again.' })} />)
    expect(screen.getByText('Could not delete that photo. Try again.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/photo-viewer.test.tsx`
Expected: FAIL — `canDelete`/`onDelete`/etc. aren't accepted props yet and no DELETE button exists.

- [ ] **Step 3: Add the props and confirm-state UI**

In `components/sofra-v2/PhotoViewer.tsx`, add to `PhotoViewerProps`:

```ts
  canDelete: boolean
  deleting: boolean
  onDelete: () => void
  deleteError: string
```

Add to the destructured function parameters:

```ts
  canDelete,
  deleting,
  onDelete,
  deleteError,
```

Add this local state right after `const dragStart = useRef<{ x: number; y: number } | null>(null)`:

```ts
  const [confirmingDelete, setConfirmingDelete] = useState(false)
```

Add this import at the top:

```ts
import { useEffect, useRef, useState } from 'react'
```

(replacing the existing `import { useEffect, useRef } from 'react'` line.)

Add this effect right after the existing keydown `useEffect` block, so switching photos always resets the confirm step:

```ts
  useEffect(() => {
    setConfirmingDelete(false)
  }, [index])
```

Replace the existing `<div className="sv2-photo-viewer-bottom">` block with:

```tsx
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
```

- [ ] **Step 4: Add the CSS**

In `components/sofra-v2/sofra-v2.css`, find the existing line (around line 1444):

```css
.sv2-photo-viewer-bottom{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-top:1px solid rgba(247,244,237,.14)}
```

Add these new rules directly after it:

```css
.sv2-photo-viewer-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}
.sv2-photo-viewer-delete-btn{flex-shrink:0;min-width:72px;text-align:center;border:1px solid rgba(247,244,237,.4);border-radius:999px;padding:8px 12px;background:transparent;color:inherit;font:500 9px var(--sv2-sans-family);letter-spacing:.6px;cursor:pointer}
.sv2-photo-viewer-delete-confirm{display:flex;align-items:center;gap:6px;flex-shrink:0}
.sv2-photo-viewer-delete-confirm span{font-size:9px;color:rgba(247,244,237,.7)}
.sv2-photo-viewer-delete-confirm button{padding:6px 10px;border:1px solid rgba(247,244,237,.4);background:transparent;color:inherit;font:500 9px var(--sv2-sans-family);text-transform:uppercase;cursor:pointer}
.sv2-photo-viewer-delete-error{margin:0;padding:8px 16px;color:#f2b8b8;font-size:10px;text-align:center}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest __tests__/photo-viewer.test.tsx`
Expected: PASS (all 5 new tests, plus any pre-existing ones in the file unaffected)

- [ ] **Step 6: Commit**

```bash
git add components/sofra-v2/PhotoViewer.tsx components/sofra-v2/sofra-v2.css __tests__/photo-viewer.test.tsx
git commit -m "Add per-photo delete with inline confirm to PhotoViewer"
```

---

### Task 4: Bulk delete in `SharedAlbumPage` select mode

**Files:**
- Modify: `components/sofra-v2/SharedAlbumPage.tsx`
- Modify: `components/sofra-v2/sofra-v2.css`
- Create: `__tests__/shared-album-page.test.tsx` (confirmed not to already exist)

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SharedAlbumPage, type AlbumPhotoView } from '@/components/sofra-v2/SharedAlbumPage'

const PHOTOS: AlbumPhotoView[] = [
  { id: 'p1', event_id: 'ev-1', uploaded_by: 'uid-1', storage_path: 'ev-1/a.jpg', caption: null, upload_batch_id: null, created_at: '2026-08-01T12:00:00Z', url: 'https://example.test/a.jpg', uploaderName: 'Ali', uploaderPhotoUrl: null },
  { id: 'p2', event_id: 'ev-1', uploaded_by: 'uid-2', storage_path: 'ev-1/b.jpg', caption: null, upload_batch_id: null, created_at: '2026-08-01T12:00:00Z', url: 'https://example.test/b.jpg', uploaderName: 'Alia', uploaderPhotoUrl: null },
]

function baseProps(overrides: Partial<React.ComponentProps<typeof SharedAlbumPage>> = {}) {
  return {
    loading: false,
    error: '',
    onRetry: jest.fn(),
    backHref: '/events/ev-1',
    eventTitle: 'Casa Mekawi',
    photos: PHOTOS,
    selectedIndex: null,
    onSelectPhoto: jest.fn(),
    onCloseViewer: jest.fn(),
    canUpload: true,
    uploading: false,
    uploadProgress: null,
    onDismissProgress: jest.fn(),
    onFilesConfirmed: jest.fn(),
    commentsOpen: false,
    onToggleComments: jest.fn(),
    comments: [],
    commentCount: null,
    commentsLoading: false,
    commentsError: '',
    onSubmitComment: jest.fn(),
    submittingComment: false,
    selectMode: true,
    selectedIds: new Set<string>(),
    onToggleSelectMode: jest.fn(),
    onTogglePhotoSelected: jest.fn(),
    onToggleSelectAll: jest.fn(),
    onSaveSelected: jest.fn(),
    saveProgress: null,
    onDismissSaveProgress: jest.fn(),
    canDeleteCurrent: false,
    deletingCurrent: false,
    onDeleteCurrent: jest.fn(),
    singleDeleteError: '',
    onDeleteSelected: jest.fn(),
    deleteProgress: null,
    onDismissDeleteProgress: jest.fn(),
    bulkDeleteError: '',
    ...overrides,
  }
}

describe('SharedAlbumPage bulk delete', () => {
  it('disables the DELETE button when nothing is selected', () => {
    render(<SharedAlbumPage {...baseProps({ selectedIds: new Set() })} />)
    expect(screen.getByRole('button', { name: /delete selected photos/i })).toBeDisabled()
  })

  it('requires a second confirm click before calling onDeleteSelected', async () => {
    const onDeleteSelected = jest.fn()
    render(<SharedAlbumPage {...baseProps({ selectedIds: new Set(['p1']), onDeleteSelected })} />)
    await userEvent.click(screen.getByRole('button', { name: /delete selected photos/i }))
    expect(onDeleteSelected).not.toHaveBeenCalled()
    expect(screen.getByText(/delete 1 photo\?/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /yes, delete/i }))
    expect(onDeleteSelected).toHaveBeenCalledTimes(1)
  })

  it('pluralizes the confirm message for multiple selected photos', async () => {
    render(<SharedAlbumPage {...baseProps({ selectedIds: new Set(['p1', 'p2']) })} />)
    await userEvent.click(screen.getByRole('button', { name: /delete selected photos/i }))
    expect(screen.getByText(/delete 2 photos\?/i)).toBeInTheDocument()
  })

  it('shows bulkDeleteError when present', () => {
    render(<SharedAlbumPage {...baseProps({ bulkDeleteError: 'You can only delete your own photos.' })} />)
    expect(screen.getByText('You can only delete your own photos.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/shared-album-page.test.tsx`
Expected: FAIL — the new props aren't accepted and no DELETE button exists in select mode.

- [ ] **Step 3: Add the props and confirm-state UI**

In `components/sofra-v2/SharedAlbumPage.tsx`, add this import:

```ts
import { PhotoDeleteProgress, type DeleteProgressState } from './PhotoDeleteProgress'
```

Add this import for `useState`:

```ts
import { useState } from 'react'
```

Add to `SharedAlbumPageProps`, right after `onDismissSaveProgress: () => void`:

```ts
  canDeleteCurrent: boolean
  deletingCurrent: boolean
  onDeleteCurrent: () => void
  singleDeleteError: string
  onDeleteSelected: () => void
  deleteProgress: DeleteProgressState | null
  onDismissDeleteProgress: () => void
  bulkDeleteError: string
```

Add to the destructured function parameters, right after `onDismissSaveProgress,`:

```ts
  canDeleteCurrent,
  deletingCurrent,
  onDeleteCurrent,
  singleDeleteError,
  onDeleteSelected,
  deleteProgress,
  onDismissDeleteProgress,
  bulkDeleteError,
```

Add this local state right after `const allSelected = photos.length > 0 && selectedIds.size === photos.length`:

```ts
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false)
  const bulkDeleting = deleteProgress?.status === 'deleting'
```

Replace the existing download-button block:

```tsx
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
```

with:

```tsx
              <div className="sv2-album-select-right">
                {confirmingBulkDelete ? (
                  <div className="sv2-album-bulk-delete-confirm">
                    <span>Delete {selectedIds.size} photo{selectedIds.size === 1 ? '' : 's'}?</span>
                    <button
                      type="button"
                      disabled={bulkDeleting}
                      onClick={() => { onDeleteSelected(); setConfirmingBulkDelete(false) }}
                    >
                      {bulkDeleting ? 'DELETING…' : 'YES, DELETE'}
                    </button>
                    <button type="button" onClick={() => setConfirmingBulkDelete(false)}>CANCEL</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="sv2-album-delete-btn"
                    onClick={() => setConfirmingBulkDelete(true)}
                    disabled={selectedIds.size === 0 || bulkDeleting}
                    aria-label="Delete selected photos"
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 6h18" />
                      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                  </button>
                )}
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
```

Add this right after the closing `</div>` of the `sv2-album-select-row` block (still inside `{selectMode && (...)}`):

```tsx
              {bulkDeleteError && <p role="alert" className="sv2-album-bulk-delete-error">{bulkDeleteError}</p>}
```

Add `canDeleteCurrent`, `deletingCurrent`, `onDeleteCurrent`, and `singleDeleteError` to the existing `<PhotoViewer ... />` call, right after `onCloseViewer` (renamed to the viewer's own prop names):

```tsx
          canDelete={canDeleteCurrent}
          deleting={deletingCurrent}
          onDelete={onDeleteCurrent}
          deleteError={singleDeleteError}
```

Add `<PhotoDeleteProgress state={deleteProgress} onDismiss={onDismissDeleteProgress} />` right after the existing `<PhotoSaveProgress ... />` line near the bottom of the component.

- [ ] **Step 4: Add the CSS**

In `components/sofra-v2/sofra-v2.css`, find the existing line (around line 1426-1428):

```css
.sv2-album-select-row{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:32px}
.sv2-album-select-left{display:flex;flex-direction:column}
.sv2-album-download-btn{flex-shrink:0;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--sv2-ink);background:transparent;color:inherit;cursor:pointer}
```

Add these new rules directly after that block:

```css
.sv2-album-select-right{flex-shrink:0;display:flex;align-items:center;gap:8px}
.sv2-album-delete-btn{flex-shrink:0;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--sv2-ink);background:transparent;color:inherit;cursor:pointer}
.sv2-album-delete-btn:disabled{opacity:.4;cursor:default}
.sv2-album-bulk-delete-confirm{display:flex;align-items:center;gap:8px}
.sv2-album-bulk-delete-confirm span{font-size:10px;color:var(--sv2-muted)}
.sv2-album-bulk-delete-confirm button{padding:6px 10px;border:1px solid var(--sv2-ink);background:transparent;color:inherit;font:500 9px var(--sv2-sans-family);text-transform:uppercase;cursor:pointer}
.sv2-album-bulk-delete-error{margin:6px 0 0;font-size:11px;color:#7a2324}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest __tests__/shared-album-page.test.tsx`
Expected: PASS (all 4 new tests)

- [ ] **Step 6: Commit**

```bash
git add components/sofra-v2/SharedAlbumPage.tsx components/sofra-v2/sofra-v2.css __tests__/shared-album-page.test.tsx
git commit -m "Add bulk delete with inline confirm to Shared Album select mode"
```

---

### Task 5: Wire it all up in `album/page.tsx`

**Files:**
- Modify: `app/(guest)/events/[id]/album/page.tsx`
- Modify: `__tests__/album-page.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `__tests__/album-page.test.tsx`, extend `makeSupabase`'s `event_photos` branch to add a `delete` chain (mirroring Task 1's mock shape):

```ts
      if (table === 'event_photos') {
        return {
          select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ order: jest.fn().mockResolvedValue({ data: photoRows, error: null }) }) }),
          insert: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not used' } }) }) }),
          delete: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
        }
      }
```

Add this new `describe` block at the end of the file:

```ts
describe('photo deletion', () => {
  it('the host sees a DELETE button in the full-screen viewer for any photo', async () => {
    localStorage.setItem('sofra_user_id', HOST_UID)
    makeSupabase({ photoRows: [photoRow(1)] })
    render(<EventAlbumPage params={PARAMS} />)
    await userEvent.click(await screen.findByRole('button', { name: /open photo 1 of 1/i }))
    expect(await screen.findByRole('button', { name: /^delete$/i })).toBeInTheDocument()
  })

  it('a non-uploader, non-host guest does not see a DELETE button', async () => {
    localStorage.setItem('sofra_user_id', 'someone-else')
    makeSupabase({ rsvpRow: { status: 'going' }, photoRows: [photoRow(1)] })
    render(<EventAlbumPage params={PARAMS} />)
    await userEvent.click(await screen.findByRole('button', { name: /open photo 1 of 1/i }))
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
  })

  it('the uploader sees a DELETE button for their own photo and deleting it closes the viewer and refreshes the album', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    const sb = makeSupabase({ rsvpRow: { status: 'going' }, photoRows: [photoRow(1)] })
    render(<EventAlbumPage params={PARAMS} />)
    await userEvent.click(await screen.findByRole('button', { name: /open photo 1 of 1/i }))
    await userEvent.click(await screen.findByRole('button', { name: /^delete$/i }))
    await userEvent.click(screen.getByRole('button', { name: /yes, delete/i }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /photo viewer/i })).not.toBeInTheDocument())
    const deleteMock = sb.from('event_photos').delete as jest.Mock
    expect(deleteMock).toHaveBeenCalled()
  })

  it('bulk-deleting a mixed selection only deletes the viewer\'s own photos and reports a partial count', async () => {
    localStorage.setItem('sofra_user_id', GUEST_UID)
    makeSupabase({
      rsvpRow: { status: 'going' },
      photoRows: [photoRow(1, { uploaded_by: GUEST_UID }), photoRow(2, { uploaded_by: 'someone-else' })],
    })
    render(<EventAlbumPage params={PARAMS} />)
    await userEvent.click(await screen.findByRole('button', { name: 'SELECT' }))
    await userEvent.click(screen.getByRole('button', { name: /select all/i }))
    await userEvent.click(screen.getByRole('button', { name: /delete selected photos/i }))
    await userEvent.click(screen.getByRole('button', { name: /yes, delete/i }))
    await waitFor(() => expect(screen.getByText('1 of 1 deleted')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/album-page.test.tsx -t "photo deletion"`
Expected: FAIL — no delete wiring exists in the page yet.

- [ ] **Step 3: Add state and handlers**

In `app/(guest)/events/[id]/album/page.tsx`, add these imports:

```ts
import { deletePhoto, deletePhotoBatch } from '@/lib/shared-album'
import { PhotoDeleteProgress, type DeleteProgressState } from '@/components/sofra-v2/PhotoDeleteProgress'
```

Add this state right after `const [saveProgress, setSaveProgress] = useState<SaveProgressState | null>(null)`:

```ts
  const [isHost, setIsHost] = useState(false)
  const [deleteProgress, setDeleteProgress] = useState<DeleteProgressState | null>(null)
  const [bulkDeleteError, setBulkDeleteError] = useState('')
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null)
  const [singleDeleteError, setSingleDeleteError] = useState('')
```

In `loadData()`, capture host status where it already computes `ev.host_id === stored` for `loadAlbum(...)` — change:

```ts
      await loadAlbum(ev.host_id === stored, rsvpRow !== null)
```

to:

```ts
      const hostViewing = ev.host_id === stored
      setIsHost(hostViewing)
      await loadAlbum(hostViewing, rsvpRow !== null)
```

Add this helper and these two handlers right after `refreshAlbum`:

```ts
  function canDeletePhoto(photo: AlbumPhotoView): boolean {
    return isHost || photo.uploaderId === uidRef.current
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
```

- [ ] **Step 4: Pass the new props to `SharedAlbumPage`**

In the `<SharedAlbumPage ... />` JSX, add right after `onDismissSaveProgress={() => setSaveProgress(null)}`:

```tsx
      canDeleteCurrent={selectedIndex !== null && photos[selectedIndex] ? canDeletePhoto(photos[selectedIndex]) : false}
      deletingCurrent={selectedIndex !== null && photos[selectedIndex] ? deletingPhotoId === photos[selectedIndex].id : false}
      onDeleteCurrent={deleteCurrentPhoto}
      singleDeleteError={singleDeleteError}
      onDeleteSelected={deleteSelected}
      deleteProgress={deleteProgress}
      onDismissDeleteProgress={() => setDeleteProgress(null)}
      bulkDeleteError={bulkDeleteError}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest __tests__/album-page.test.tsx`
Expected: PASS (all tests, including the 4 new ones)

- [ ] **Step 6: Commit**

```bash
git add app/\(guest\)/events/\[id\]/album/page.tsx __tests__/album-page.test.tsx
git commit -m "Wire photo deletion into the Shared Album page"
```

---

### Task 6: Full verification and docs

**Files:**
- Modify: `docs/IMPLEMENTATION_STATUS.md`

- [ ] **Step 1: Run the full test suite**

Run: `npx jest --runInBand`
Expected: All new tests pass; no newly introduced failures (compare against the known pre-existing `design-preview-application.test.tsx` timeout failures already present before this change).

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No new warnings/errors beyond the pre-existing `<img>` warnings.

- [ ] **Step 3: Verify with a clean worktree production build**

```bash
git worktree add /tmp/sofra-verify-delete HEAD
# copy every file this plan touched into the worktree, then:
cd /tmp/sofra-verify-delete && npm install && SOFRA_BUILD_DIST_DIR=.next-verify npm run build
```

Expected: Build succeeds. Then clean up:

```bash
cd <repo root> && git worktree remove /tmp/sofra-verify-delete --force && git worktree prune
```

- [ ] **Step 4: Update `docs/IMPLEMENTATION_STATUS.md`**

Add a new entry under a `## Shared Album photo deletion (2026-08-20)` heading, describing: uploader/host-only client-enforced permission (matching the existing anonymous-MVP precedent); both viewer and select-mode bulk delete with a two-step inline confirm; storage-object-then-row deletion with cascading comment cleanup; partial-result messaging reused from the existing save/upload pattern; test/build verification results.

- [ ] **Step 5: Commit**

```bash
git add docs/IMPLEMENTATION_STATUS.md
git commit -m "Document Shared Album photo deletion in IMPLEMENTATION_STATUS"
```
