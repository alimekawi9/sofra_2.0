import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeToggle } from '@/components/sofra-v2/ThemeToggle'

const PREVIEW_KEY = 'sofra-v2-preview-theme'
const APP_KEY = 'sofra_theme'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('ThemeToggle', () => {
  it('defaults to the dark preview theme when no preference is stored', () => {
    render(<ThemeToggle />)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(screen.getByRole('button', { name: 'Dark preview theme (current)' })).toBeInTheDocument()
  })

  it('switches from dark to light when Light is clicked', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    await user.click(screen.getByRole('button', { name: 'Switch to light preview theme' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('switches from light back to dark when Dark is clicked', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    await user.click(screen.getByRole('button', { name: 'Switch to light preview theme' }))
    await user.click(screen.getByRole('button', { name: 'Switch to dark preview theme' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('updates aria-label and aria-pressed on both buttons as the state changes', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: 'Dark preview theme (current)' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Switch to light preview theme' })).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByRole('button', { name: 'Switch to light preview theme' }))

    expect(screen.getByRole('button', { name: 'Light preview theme (current)' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Switch to dark preview theme' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reflects the selected theme via the data-theme attribute', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    await user.click(screen.getByRole('button', { name: 'Switch to light preview theme' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('persists the choice under a dedicated preview-only key and restores it on next mount', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<ThemeToggle />)
    await user.click(screen.getByRole('button', { name: 'Switch to light preview theme' }))
    expect(localStorage.getItem(PREVIEW_KEY)).toBe('light')
    unmount()

    document.documentElement.removeAttribute('data-theme')
    render(<ThemeToggle />)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('never reads or writes the existing app-wide theme key', async () => {
    const user = userEvent.setup()
    localStorage.setItem(APP_KEY, 'light')
    render(<ThemeToggle />)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    await user.click(screen.getByRole('button', { name: 'Switch to light preview theme' }))
    expect(localStorage.getItem(APP_KEY)).toBe('light')
    expect(localStorage.getItem(PREVIEW_KEY)).toBe('light')
  })
})
