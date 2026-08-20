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
