import { act, render, screen } from '@testing-library/react'
import SofraTransition from '@/components/SofraTransition'

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

it('does not show the long-table preview for work finishing within one second', () => {
  const { rerender } = render(<SofraTransition active label="Loading" />)
  act(() => jest.advanceTimersByTime(999))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  rerender(<SofraTransition active={false} label="Loading" />)
  act(() => jest.advanceTimersByTime(1))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('shows the shared transition once work lasts at least one second', () => {
  render(<SofraTransition active label="Loading" />)
  act(() => jest.advanceTimersByTime(1000))
  expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
})
