import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HostEntryPlate } from '@/components/sofra-v2/HostEntryPlate'

jest.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: (_target, tag) => tag }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}))

it('renders the plate scene with the ready-to-host card', () => {
  render(<HostEntryPlate onEnter={jest.fn()} />)
  expect(screen.getByRole('button', { name: /start hosting a sofra/i })).toBeInTheDocument()
  expect(screen.getByText(/ready to host/i)).toBeInTheDocument()
  expect(screen.getByText(/your own sofra\?/i)).toBeInTheDocument()
})

it('calls onEnter once the leave transition has had time to play', async () => {
  const onEnter = jest.fn()
  render(<HostEntryPlate onEnter={onEnter} />)

  await userEvent.click(screen.getByRole('button', { name: /start hosting a sofra/i }))
  expect(onEnter).not.toHaveBeenCalled()

  await waitFor(() => expect(onEnter).toHaveBeenCalledTimes(1), { timeout: 1000 })
})

it('does not call onEnter a second time from a rapid double click', async () => {
  const onEnter = jest.fn()
  render(<HostEntryPlate onEnter={onEnter} />)

  const button = screen.getByRole('button', { name: /start hosting a sofra/i })
  await userEvent.click(button)
  await userEvent.click(button) // second click should be a no-op — button is disabled once leaving

  await waitFor(() => expect(onEnter).toHaveBeenCalledTimes(1), { timeout: 1000 })
})
