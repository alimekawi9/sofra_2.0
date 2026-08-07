import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import userEvent from '@testing-library/user-event'
import { ThemeToggle } from '@/components/sofra-v2/ThemeToggle'
import { WelcomeCard } from '@/components/sofra-v2/WelcomeCard'
import { PreferencesReceipt } from '@/components/sofra-v2/PreferencesReceipt'
import { SignupForm } from '@/components/sofra-v2/SignupForm'
import { NamePlateForm } from '@/components/sofra-v2/NamePlateForm'
import DesignPreviewWelcomePage from '@/app/design-preview/welcome/page'
import DesignPreviewPreferencesPage from '@/app/design-preview/preferences/page'
import DesignPreviewSignupPage from '@/app/design-preview/signup/page'
import DesignPreviewNamePage from '@/app/design-preview/name/page'
import DesignPreviewIndexPage from '@/app/design-preview/page'
import DesignPreviewEventsPage from '@/app/design-preview/events/page'
import DesignPreviewEventDetailPage from '@/app/design-preview/events/demo/page'
import DesignPreviewProfilePage from '@/app/design-preview/profile/page'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { DIETARY, NOGOS, FLAVORS } from '@/lib/theme'
import {
  PROTEIN_PREFERENCE_OPTIONS,
  updateProteinPreferenceSelection,
  type ProteinPreference,
} from '@/lib/protein-preferences'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))

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
  it('renders the centered arabesque ornament as decorative artwork', () => {
    const { container } = render(<WelcomeCard onYalla={jest.fn()} />)
    const ornament = container.querySelector('.sv2-welcome-ornament img')
    expect(ornament).toHaveAttribute('src', expect.stringContaining('arabesque-ornament.png'))
    expect(ornament).toHaveAttribute('alt', '')
  })

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

describe('PreferencesReceipt', () => {
  const noop = () => {}
  const baseProps = {
    dietary: [] as string[],
    onToggleDietary: noop,
    avoid: [] as string[],
    onToggleAvoid: noop,
    proteinPreferences: [] as ProteinPreference[],
    onToggleProtein: noop,
    proteinHintVisible: false,
    flavors: [] as string[],
    onToggleFlavor: noop,
    flavorHintVisible: false,
    adventurousness: 50,
    onAdventurousnessChange: noop,
    onSave: noop,
  }

  it('renders every real preference option using the raw stored values', () => {
    render(<PreferencesReceipt {...baseProps} />)
    for (const item of [...DIETARY, ...NOGOS, ...FLAVORS]) {
      expect(screen.getAllByText(item).length).toBeGreaterThan(0)
    }
    for (const option of PROTEIN_PREFERENCE_OPTIONS) {
      expect(screen.getAllByText(option.label).length).toBeGreaterThan(0)
    }
  })

  it('uses a repeatable full-width perforation pattern instead of a finite image', () => {
    const { container } = render(<PreferencesReceipt {...baseProps} />)
    const perforation = screen.getByTestId('receipt-perforation')
    expect(perforation).toHaveClass('sv2-perforation')
    expect(perforation.tagName).toBe('DIV')
    expect(container.querySelector('img[src="/design-preview/perforation-top.svg"]')).toBeNull()
    expect(perforation).toBeEmptyDOMElement()
  })

  it('does not render the Figma mockup alcohol section or a standalone Halal option', () => {
    render(<PreferencesReceipt {...baseProps} />)
    expect(screen.queryByText('POUR ME')).not.toBeInTheDocument()
    expect(screen.queryByText('Wine')).not.toBeInTheDocument()
    expect(screen.queryByText('Spirits')).not.toBeInTheDocument()
    expect(screen.queryByText('Cocktails')).not.toBeInTheDocument()
    expect(screen.queryByText('Non-alcoholic')).not.toBeInTheDocument()
    expect(screen.queryByText('Beer')).not.toBeInTheDocument()
    expect(screen.queryByText('Halal')).not.toBeInTheDocument()
  })

  it('calls onToggleDietary with the raw stored value when a dietary option is clicked', async () => {
    const user = userEvent.setup()
    const onToggleDietary = jest.fn()
    render(<PreferencesReceipt {...baseProps} onToggleDietary={onToggleDietary} />)
    await user.click(screen.getByRole('checkbox', { name: 'No pork/alcohol' }))
    expect(onToggleDietary).toHaveBeenCalledWith('No pork/alcohol')
  })

  it('renders selected options as functional icon-free boxes', () => {
    const { container } = render(
      <PreferencesReceipt {...baseProps} dietary={['Vegetarian']} />
    )
    const checkbox = screen.getByRole('checkbox', { name: 'Vegetarian' })
    expect(checkbox).toBeChecked()
    const selectedBox = checkbox.parentElement?.querySelector('.sv2-checkbox-box')
    expect(selectedBox).toBeEmptyDOMElement()
    expect(selectedBox?.querySelector('svg, img')).toBeNull()
    expect(container.querySelector('.sv2-checkbox-box svg, .sv2-checkbox-box img')).toBeNull()
  })

  it('calls onToggleAvoid with the raw stored value when an allergen is clicked', async () => {
    const user = userEvent.setup()
    const onToggleAvoid = jest.fn()
    render(<PreferencesReceipt {...baseProps} onToggleAvoid={onToggleAvoid} />)
    await user.click(screen.getByRole('checkbox', { name: 'Pork' }))
    expect(onToggleAvoid).toHaveBeenCalledWith('Pork')
  })

  it('calls onToggleFlavor with the raw stored value when a flavor is clicked', async () => {
    const user = userEvent.setup()
    const onToggleFlavor = jest.fn()
    render(<PreferencesReceipt {...baseProps} onToggleFlavor={onToggleFlavor} />)
    await user.click(screen.getByRole('checkbox', { name: 'Sweet-savoury' }))
    expect(onToggleFlavor).toHaveBeenCalledWith('Sweet-savoury')
  })

  it('always explains the maximum flavor selection count', () => {
    const { rerender } = render(<PreferencesReceipt {...baseProps} />)
    expect(screen.getByText('Choose up to three.')).toHaveClass('sv2-section-sub')
    rerender(<PreferencesReceipt {...baseProps} flavorHintVisible />)
    expect(screen.getByText('Choose up to three.')).toHaveClass('sv2-hint')
  })

  it('calls onToggleProtein with the raw preference value when a protein option is clicked', async () => {
    const user = userEvent.setup()
    const onToggleProtein = jest.fn()
    render(<PreferencesReceipt {...baseProps} onToggleProtein={onToggleProtein} />)
    await user.click(screen.getByRole('checkbox', { name: 'Beef or lamb' }))
    expect(onToggleProtein).toHaveBeenCalledWith('beef_lamb')
  })

  it('calls onAdventurousnessChange with a number when the slider moves', () => {
    const onAdventurousnessChange = jest.fn()
    render(<PreferencesReceipt {...baseProps} onAdventurousnessChange={onAdventurousnessChange} />)
    fireEvent.change(screen.getByLabelText('Adventurousness'), { target: { value: '80' } })
    expect(onAdventurousnessChange).toHaveBeenCalledWith(80)
  })

  it('calls onSave when the save button is clicked', async () => {
    const user = userEvent.setup()
    const onSave = jest.fn()
    render(<PreferencesReceipt {...baseProps} onSave={onSave} />)
    await user.click(screen.getByRole('button', { name: 'SAVE MY SEAT' }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('reflects a controlled proteinHintVisible prop', () => {
    const { rerender } = render(<PreferencesReceipt {...baseProps} proteinHintVisible={false} />)
    expect(screen.queryByText('Only two at a time — tap one to swap it out.')).not.toBeInTheDocument()
    rerender(<PreferencesReceipt {...baseProps} proteinHintVisible />)
    expect(screen.getByText('Only two at a time — tap one to swap it out.')).toBeInTheDocument()
  })

  describe('driven end-to-end with the real protein-preference utility', () => {
    // Proves PreferencesReceipt's contract against the real
    // updateProteinPreferenceSelection utility. Deliberately simpler than
    // app/(guest)/events/[id]/rsvp/page.tsx's actual wiring (which also uses
    // refs and a setTimeout auto-clear on the hint) — this only covers the
    // component/utility contract, not that page's full state management.
    function ControlledHarness() {
      const [proteinPreferences, setProteinPreferences] = useState<ProteinPreference[]>([])
      const [hint, setHint] = useState(false)

      function handleToggleProtein(value: ProteinPreference) {
        const update = updateProteinPreferenceSelection(proteinPreferences, value)
        if (update.blocked) {
          setHint(true)
          return
        }
        setHint(false)
        setProteinPreferences(update.preferences)
      }

      return (
        <PreferencesReceipt
          {...baseProps}
          proteinPreferences={proteinPreferences}
          onToggleProtein={handleToggleProtein}
          proteinHintVisible={hint}
        />
      )
    }

    it('caps protein preference selection at two', async () => {
      const user = userEvent.setup()
      const [first, second, third] = PROTEIN_PREFERENCE_OPTIONS.filter((o) => o.value !== 'no_preference')
      render(<ControlledHarness />)
      await user.click(screen.getByRole('checkbox', { name: first.label }))
      await user.click(screen.getByRole('checkbox', { name: second.label }))
      await user.click(screen.getByRole('checkbox', { name: third.label }))
      expect(screen.getByText('Only two at a time — tap one to swap it out.')).toBeInTheDocument()
      expect(screen.getByRole('checkbox', { name: first.label })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: second.label })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: third.label })).not.toBeChecked()
    })

    it('selecting "no preference" clears any specific selections (exclusivity)', async () => {
      const user = userEvent.setup()
      const beef = PROTEIN_PREFERENCE_OPTIONS.find((o) => o.value === 'beef_lamb')!
      const noPreference = PROTEIN_PREFERENCE_OPTIONS.find((o) => o.value === 'no_preference')!
      render(<ControlledHarness />)
      await user.click(screen.getByRole('checkbox', { name: beef.label }))
      expect(screen.getByRole('checkbox', { name: beef.label })).toBeChecked()

      await user.click(screen.getByRole('checkbox', { name: noPreference.label }))
      expect(screen.getByRole('checkbox', { name: noPreference.label })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: beef.label })).not.toBeChecked()
    })
  })
})

describe('SignupForm', () => {
  const baseProps = {
    phone: '',
    onPhoneChange: jest.fn(),
    onSubmit: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders one labeled phone field over the burgundy plate asset', () => {
    const { container } = render(<SignupForm {...baseProps} />)
    const input = screen.getByLabelText('Phone number')
    expect(input).toHaveAttribute('type', 'tel')
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(input).toHaveAttribute('autocomplete', 'tel')
    expect(input).toHaveAttribute('pattern', '[0-9+ ]*')
    expect(input).toHaveAttribute('placeholder', 'e.g. +20 10 1234 5678')
    expect(input).toHaveValue('')
    expect(input).toHaveClass('sv2-plate-input')
    expect(input.closest('.sv2-plate-bowl')).toBeInTheDocument()
    expect(container.querySelector('.sv2-plate-image')).toHaveAttribute('src', expect.stringContaining('burgundy-plate.png'))
    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument()
  })

  it('shows only the new heading above a dedicated enlarged phone plate', () => {
    render(<SignupForm {...baseProps} />)
    const heading = screen.getByRole('heading', { name: 'Enter your phone number' })
    expect(Array.from(heading.querySelectorAll('span')).map((line) => line.textContent)).toEqual([
      'Enter your',
      'phone number',
    ])
    expect(screen.getByTestId('phone-plate')).toHaveClass('sv2-plate-wrap')
    expect(screen.queryByText('EST. 2026')).not.toBeInTheDocument()
    expect(screen.queryByText('Sofra.')).not.toBeInTheDocument()
    expect(screen.queryByText(/No passwords/)).not.toBeInTheDocument()
    expect(screen.queryByText('PHONE NUMBER')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('_ _ _ _')).not.toBeInTheDocument()
  })

  it('reports controlled phone changes', async () => {
    const user = userEvent.setup()
    render(<SignupForm {...baseProps} />)
    await user.type(screen.getByLabelText('Phone number'), '5')
    expect(baseProps.onPhoneChange).toHaveBeenCalledWith('5')
  })

  it('disables submit for empty or whitespace-only values', () => {
    const { rerender } = render(<SignupForm {...baseProps} />)
    expect(screen.getByRole('button', { name: 'CONTINUE' })).toBeDisabled()
    rerender(<SignupForm {...baseProps} phone="   " />)
    expect(screen.getByRole('button', { name: 'CONTINUE' })).toBeDisabled()
  })

  it('enables submit when the controlled phone value is meaningful', () => {
    render(<SignupForm {...baseProps} phone="5551234567" />)
    expect(screen.getByRole('button', { name: 'CONTINUE' })).toBeEnabled()
  })

  it('prevents browser submission and calls onSubmit', () => {
    const onSubmit = jest.fn()
    render(<SignupForm {...baseProps} phone="5551234567" onSubmit={onSubmit} />)
    fireEvent.submit(screen.getByRole('button', { name: 'CONTINUE' }).closest('form')!)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('contains no password field', () => {
    const { container } = render(<SignupForm {...baseProps} />)
    expect(container.querySelector('input[type="password"]')).toBeNull()
  })
})

describe('NamePlateForm', () => {
  const baseProps = { name: '', onNameChange: jest.fn(), onSubmit: jest.fn() }

  beforeEach(() => jest.clearAllMocks())

  it('renders one centered name input over the silver plate asset', () => {
    const { container } = render(<NamePlateForm {...baseProps} />)
    const input = screen.getByLabelText('Your name')
    expect(input).toHaveAttribute('autocomplete', 'name')
    expect(input).toHaveAttribute('placeholder', 'e.g. Alia')
    expect(input).toHaveValue('')
    expect(input).toHaveClass('sv2-plate-input')
    expect(input.closest('.sv2-plate-bowl')).toBeInTheDocument()
    expect(container.querySelector('.sv2-plate-image')).toHaveAttribute('src', expect.stringContaining('silver-plate.png'))
    expect(screen.queryByLabelText('Phone number')).not.toBeInTheDocument()
  })

  it('renders the name heading as the same explicit two-line structure', () => {
    render(<NamePlateForm {...baseProps} />)
    const heading = screen.getByRole('heading', { name: 'Enter your name' })
    expect(Array.from(heading.querySelectorAll('span')).map((line) => line.textContent)).toEqual([
      'Enter your',
      'name',
    ])
  })

  it('shares the plate-step structure with the phone form', () => {
    const name = render(<NamePlateForm {...baseProps} />)
    expect(name.container.querySelector('.sv2-plate-step')).toHaveClass('sv2-receipt-surface')
    expect(screen.getByRole('heading', { name: 'Enter your name' })).toBeInTheDocument()
    expect(name.container.querySelector('.sv2-plate-wrap')).toBeInTheDocument()
    expect(name.container.querySelector('.sv2-plate-bowl .sv2-plate-input')).toBeInTheDocument()
    expect(name.container.querySelector('.sv2-plate-action')).toHaveTextContent('CONTINUE')
    name.unmount()

    const phone = render(<SignupForm phone="" onPhoneChange={jest.fn()} onSubmit={jest.fn()} />)
    expect(phone.container.querySelector('.sv2-plate-step')).toHaveClass('sv2-receipt-surface')
    expect(screen.getByRole('heading', { name: 'Enter your phone number' })).toBeInTheDocument()
    expect(phone.container.querySelector('.sv2-plate-wrap')).toBeInTheDocument()
    expect(phone.container.querySelector('.sv2-plate-bowl .sv2-plate-input')).toBeInTheDocument()
    expect(phone.container.querySelector('.sv2-plate-action')).toHaveTextContent('CONTINUE')
  })

  it('preserves controlled name behavior and only submits a meaningful name', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<NamePlateForm {...baseProps} />)
    await user.type(screen.getByLabelText('Your name'), 'L')
    expect(baseProps.onNameChange).toHaveBeenCalledWith('L')
    expect(screen.getByRole('button', { name: 'CONTINUE' })).toBeDisabled()
    rerender(<NamePlateForm {...baseProps} name="Layla" />)
    expect(screen.getByRole('button', { name: 'CONTINUE' })).toBeEnabled()
  })
})

describe('design preview routes', () => {
  const mockPush = jest.fn()

  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute(PREVIEW_ATTR)
    mockPush.mockClear()
    ;(createClient as jest.Mock).mockClear()
    ;(useRouter as jest.Mock).mockReturnValue({ push: mockPush })
  })

  it('renders WelcomeCard without a visible theme control on the welcome route', () => {
    render(<DesignPreviewWelcomePage />)
    expect(screen.getByText('Sofra.')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Preview appearance' })).not.toBeInTheDocument()
  })

  it('lists every requested preview destination and labels missing pages honestly', () => {
    const { container } = render(<DesignPreviewIndexPage />)
    const routes = [
      '/design-preview/welcome',
      '/design-preview/signup',
      '/design-preview/code',
      '/design-preview/name',
      '/design-preview/events',
      '/design-preview/events/demo',
      '/design-preview/preferences',
      '/design-preview/invite',
      '/design-preview/invite/templates',
      '/design-preview/customization',
      '/design-preview/menu',
      '/design-preview/profile',
    ]

    for (const route of routes) {
      expect(screen.getByText(route)).toBeInTheDocument()
      expect(container.querySelector(`a[href="${route}"]`)).toBeInTheDocument()
    }
    expect(screen.getAllByText('Available')).toHaveLength(4)
    expect(screen.getAllByText('Planned — not implemented')).toHaveLength(8)
  })

  it('renders the local events dashboard and keeps event details distinct', () => {
    const dashboard = render(<DesignPreviewEventsPage />)
    expect(screen.getByText('Your table history')).toBeInTheDocument()
    expect(screen.getByText("Ali's Sofra")).toBeInTheDocument()
    expect(dashboard.container.querySelector('a[href="/design-preview/events/demo"]')).toBeInTheDocument()
    dashboard.unmount()

    render(<DesignPreviewEventDetailPage />)
    expect(screen.getByText('A table set with love for the people I love. Join me for an evening of good food, warm conversation, and Middle Eastern hospitality.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /will you be joining/i })).toBeInTheDocument()
  })

  it('keeps RSVP interaction local to the event-detail preview', async () => {
    const user = userEvent.setup()
    render(<DesignPreviewEventDetailPage />)
    await user.click(screen.getByRole('button', { name: 'save me a seat' }))
    expect(screen.getByText('Your preview response: save me a seat.')).toBeInTheDocument()
    expect(createClient).not.toHaveBeenCalled()
  })

  it('renders the profile frame with preview-only appearance controls', () => {
    render(<DesignPreviewProfilePage />)
    expect(screen.getByRole('heading', { name: 'Ali' })).toBeInTheDocument()
    expect(screen.getByText('4 dinners · since 2025')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Preview appearance' })).toBeInTheDocument()
    expect(createClient).not.toHaveBeenCalled()
  })

  it('navigates YALLA only to the isolated signup preview route', async () => {
    const user = userEvent.setup()
    render(<DesignPreviewWelcomePage />)
    await user.click(screen.getByRole('button', { name: 'YALLA' }))
    expect(mockPush).toHaveBeenCalledWith('/design-preview/signup')
  })

  it('renders PreferencesReceipt without a visible theme control on the preferences route', () => {
    render(<DesignPreviewPreferencesPage />)
    expect(screen.getByText('DEAL BREAKERS')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'SAVE MY SEAT' })).toBeInTheDocument()
    expect(screen.getByTestId('receipt-perforation')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Preview appearance' })).not.toBeInTheDocument()
  })

  it('uses the same shared device shell for every preview route', () => {
    const welcome = render(<DesignPreviewWelcomePage />)
    expect(welcome.container.querySelector('.sv2-device-page .sv2-device-shell')).toBeInTheDocument()
    welcome.unmount()

    const signup = render(<DesignPreviewSignupPage />)
    expect(signup.container.querySelector('.sv2-device-page .sv2-device-shell')).toBeInTheDocument()
    signup.unmount()

    const name = render(<DesignPreviewNamePage />)
    expect(name.container.querySelector('.sv2-device-page .sv2-device-shell')).toBeInTheDocument()
    name.unmount()

    const preferences = render(<DesignPreviewPreferencesPage />)
    expect(preferences.container.querySelector('.sv2-device-page .sv2-device-shell.sv2-receipt-card')).toBeInTheDocument()
  })

  it('renders the phone-only signup on a burgundy plate and continues to the name route', async () => {
    const user = userEvent.setup()
    const { container } = render(<DesignPreviewSignupPage />)
    expect(container.querySelector('.sv2-plate-wrap--burgundy')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Preview appearance' })).not.toBeInTheDocument()
    const phone = screen.getByLabelText('Phone number')
    await user.type(phone, '+20 10 1234 5678')
    expect(phone).toHaveValue('+20 10 1234 5678')
    await user.click(screen.getByRole('button', { name: 'CONTINUE' }))
    expect(mockPush).toHaveBeenCalledWith('/design-preview/name')
  })

  it('renders the name-only silver plate and continues to preferences', async () => {
    const user = userEvent.setup()
    const { container } = render(<DesignPreviewNamePage />)
    expect(container.querySelector('.sv2-plate-wrap--silver')).toBeInTheDocument()
    const name = screen.getByLabelText('Your name')
    await user.type(name, 'Layla')
    expect(name).toHaveValue('Layla')
    await user.click(screen.getByRole('button', { name: 'CONTINUE' }))
    expect(mockPush).toHaveBeenCalledWith('/design-preview/preferences')
  })

  it('owns and updates dietary, avoid, and flavor selections locally', async () => {
    const user = userEvent.setup()
    render(<DesignPreviewPreferencesPage />)

    const dietary = screen.getByRole('checkbox', { name: 'Vegetarian' })
    const avoid = screen.getByRole('checkbox', { name: 'Nuts' })
    const flavor = screen.getByRole('checkbox', { name: 'Umami' })
    await user.click(dietary)
    await user.click(avoid)
    await user.click(flavor)

    expect(dietary).toBeChecked()
    expect(avoid).toBeChecked()
    expect(flavor).toBeChecked()
  })

  it('uses the shared max-three flavor rule and clears the hint after a removal', async () => {
    const user = userEvent.setup()
    render(<DesignPreviewPreferencesPage />)
    const [first, second, third, fourth] = FLAVORS

    await user.click(screen.getByRole('checkbox', { name: first }))
    await user.click(screen.getByRole('checkbox', { name: second }))
    await user.click(screen.getByRole('checkbox', { name: third }))
    await user.click(screen.getByRole('checkbox', { name: fourth }))

    expect(screen.getByRole('checkbox', { name: first })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: second })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: third })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: fourth })).not.toBeChecked()
    expect(screen.getByText('Choose up to three.')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: second }))
    expect(screen.getByText('Choose up to three.')).toHaveClass('sv2-section-sub')
    await user.click(screen.getByRole('checkbox', { name: fourth }))
    expect(screen.getByRole('checkbox', { name: fourth })).toBeChecked()
  })

  it('owns and updates adventurousness locally', () => {
    render(<DesignPreviewPreferencesPage />)
    const slider = screen.getByLabelText('Adventurousness')
    fireEvent.change(slider, { target: { value: '85' } })
    expect(slider).toHaveValue('85')
    expect(screen.getByText('Chef, surprise me')).toBeInTheDocument()
  })

  it('uses the shared max-two protein rule', async () => {
    const user = userEvent.setup()
    render(<DesignPreviewPreferencesPage />)
    await user.click(screen.getByRole('checkbox', { name: 'Beef or lamb' }))
    await user.click(screen.getByRole('checkbox', { name: 'Chicken' }))
    await user.click(screen.getByRole('checkbox', { name: 'Fish' }))

    expect(screen.getByRole('checkbox', { name: 'Beef or lamb' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Chicken' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Fish' })).not.toBeChecked()
    expect(screen.getByText(/only two at a time/i)).toBeInTheDocument()
  })

  it('uses the shared no-preference exclusivity rule', async () => {
    const user = userEvent.setup()
    render(<DesignPreviewPreferencesPage />)
    await user.click(screen.getByRole('checkbox', { name: 'Fish' }))
    await user.click(screen.getByRole('checkbox', { name: /no preference/i }))

    expect(screen.getByRole('checkbox', { name: 'Fish' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /no preference/i })).toBeChecked()
  })

  it('does not create a Supabase client in any preview route', () => {
    const welcome = render(<DesignPreviewWelcomePage />)
    welcome.unmount()
    const preferences = render(<DesignPreviewPreferencesPage />)
    preferences.unmount()
    const signup = render(<DesignPreviewSignupPage />)
    signup.unmount()
    render(<DesignPreviewNamePage />)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('uses dark defaults without changing either theme attribute', () => {
    document.documentElement.setAttribute(APP_ATTR, 'dark')
    render(<DesignPreviewSignupPage />)
    expect(document.documentElement.getAttribute(PREVIEW_ATTR)).toBeNull()
    expect(document.documentElement.getAttribute(APP_ATTR)).toBe('dark')
  })
})
