import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeToggle } from '@/components/sofra-v2/ThemeToggle'
import { WelcomeCard } from '@/components/sofra-v2/WelcomeCard'

const PREVIEW_KEY = 'sofra-v2-preview-theme'
const APP_KEY = 'sofra_theme'
const APP_ATTR = 'data-theme'
const PREVIEW_ATTR = 'data-sv2-theme'

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute(PREVIEW_ATTR)
    document.documentElement.removeAttribute(APP_ATTR)
  })

  it('defaults to the dark preview theme when no preference is stored', () => {
    render(<ThemeToggle />)
    expect(document.documentElement.getAttribute(PREVIEW_ATTR)).toBe('dark')
    expect(screen.getByRole('button', { name: 'Dark preview theme (current)' })).toBeInTheDocument()
  })

  it('switches from dark to light when Light is clicked', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    await user.click(screen.getByRole('button', { name: 'Switch to light preview theme' }))
    expect(document.documentElement.getAttribute(PREVIEW_ATTR)).toBe('light')
  })

  it('switches from light back to dark when Dark is clicked', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    await user.click(screen.getByRole('button', { name: 'Switch to light preview theme' }))
    await user.click(screen.getByRole('button', { name: 'Switch to dark preview theme' }))
    expect(document.documentElement.getAttribute(PREVIEW_ATTR)).toBe('dark')
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

  it('persists the choice under a dedicated preview-only key and restores it on next mount', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<ThemeToggle />)
    await user.click(screen.getByRole('button', { name: 'Switch to light preview theme' }))
    expect(localStorage.getItem(PREVIEW_KEY)).toBe('light')
    unmount()

    render(<ThemeToggle />)
    expect(document.documentElement.getAttribute(PREVIEW_ATTR)).toBe('light')
  })

  it('never reads or writes the existing app-wide theme key', async () => {
    const user = userEvent.setup()
    const sentinel = 'not-a-real-theme-value'
    localStorage.setItem(APP_KEY, sentinel)
    render(<ThemeToggle />)
    expect(document.documentElement.getAttribute(PREVIEW_ATTR)).toBe('dark')

    await user.click(screen.getByRole('button', { name: 'Switch to light preview theme' }))
    expect(localStorage.getItem(APP_KEY)).toBe(sentinel)
    expect(localStorage.getItem(PREVIEW_KEY)).toBe('light')
  })

  it('never writes or removes the production data-theme attribute', async () => {
    const user = userEvent.setup()
    document.documentElement.setAttribute(APP_ATTR, 'light')
    const { unmount } = render(<ThemeToggle />)
    expect(document.documentElement.getAttribute(APP_ATTR)).toBe('light')

    await user.click(screen.getByRole('button', { name: 'Switch to light preview theme' }))
    expect(document.documentElement.getAttribute(APP_ATTR)).toBe('light')

    await user.click(screen.getByRole('button', { name: 'Switch to dark preview theme' }))
    expect(document.documentElement.getAttribute(APP_ATTR)).toBe('light')

    unmount()
    expect(document.documentElement.getAttribute(APP_ATTR)).toBe('light')
  })

  it('removes the preview-only attribute from the document when unmounted', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<ThemeToggle />)
    await user.click(screen.getByRole('button', { name: 'Switch to light preview theme' }))
    expect(document.documentElement.getAttribute(PREVIEW_ATTR)).toBe('light')

    unmount()
    expect(document.documentElement.getAttribute(PREVIEW_ATTR)).toBeNull()
  })
})

describe('WelcomeCard', () => {
  it('renders the welcome copy and eyebrow', () => {
    render(<WelcomeCard onYalla={jest.fn()} />)
    expect(screen.getByText('EST. 2026')).toBeInTheDocument()
    expect(screen.getByText('اتفضلوا على السفرة')).toBeInTheDocument()
    expect(screen.getByText('Sofra.')).toBeInTheDocument()
  })

  it('renders an accessible YALLA button', () => {
    render(<WelcomeCard onYalla={jest.fn()} />)
    const button = screen.getByRole('button', { name: 'YALLA' })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('type', 'button')
  })

  it('calls onYalla when the button is clicked', async () => {
    const user = userEvent.setup()
    const onYalla = jest.fn()
    render(<WelcomeCard onYalla={onYalla} />)
    await user.click(screen.getByRole('button', { name: 'YALLA' }))
    expect(onYalla).toHaveBeenCalledTimes(1)
  })

  it('calls onYalla when activated via keyboard', async () => {
    const user = userEvent.setup()
    const onYalla = jest.fn()
    render(<WelcomeCard onYalla={onYalla} />)
    await user.tab()
    expect(screen.getByRole('button', { name: 'YALLA' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onYalla).toHaveBeenCalledTimes(1)
  })
})
