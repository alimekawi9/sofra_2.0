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
