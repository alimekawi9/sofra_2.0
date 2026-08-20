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
