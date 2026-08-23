import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import KitchenPage from '@/app/(chef)/kitchen/page'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

type Write = { table: string; kind: 'insert' | 'update' | 'delete'; payload: Record<string, unknown> }
let writes: Write[] = []

const signature = {
  id: 'sig-1',
  name: 'Roast Chicken',
  tags: ['main', 'room_temperature'],
  contains_allergens: [],
  preset_key: null,
}
const savedPreset = {
  id: 'sig-baba',
  name: 'Baba Ganoush',
  tags: ['starter', 'veg'],
  contains_allergens: [],
  preset_key: 'Levantine::baba ganoush',
}
const pantry = {
  id: 'pantry-1',
  name: 'Tomato',
  week_of: '2026-08-03',
  tags: ['savory', 'main'],
  contains_allergens: [],
}

// Mutable "server" rows so order() reflects writes made earlier in a test
// (e.g. renaming, then reloading). Reset fresh in beforeEach.
let signatureRows: Array<Record<string, unknown>> = []
let pantryRows: Array<Record<string, unknown>> = []

function applyUpdate(table: string, id: string, payload: Record<string, unknown>) {
  const rows = table === 'signatures' ? signatureRows : pantryRows
  const idx = rows.findIndex((r) => r.id === id)
  if (idx !== -1) rows[idx] = { ...rows[idx], ...payload }
}

function builder(table: string) {
  let write: Write | null = null
  const chain: Record<string, jest.Mock> & { then?: Promise<unknown>['then'] } = {
    select: jest.fn(() => chain),
    eq: jest.fn((col: string, val: string) => {
      if (col === 'id' && write?.kind === 'update') applyUpdate(table, val, write.payload)
      if (col === 'id' && write?.kind === 'delete') {
        if (table === 'pantry_items') pantryRows = pantryRows.filter((row) => row.id !== val)
        if (table === 'signatures') signatureRows = signatureRows.filter((row) => row.id !== val)
      }
      return chain
    }),
    order: jest.fn(() => Promise.resolve({
      data: table === 'signatures' ? [...signatureRows] : [...pantryRows],
      error: null,
    })),
    insert: jest.fn((payload) => {
      write = { table, kind: 'insert', payload }
      writes.push(write)
      return chain
    }),
    update: jest.fn((payload) => {
      write = { table, kind: 'update', payload }
      writes.push(write)
      return chain
    }),
    single: jest.fn(() => {
      const insertedId = table === 'signatures' ? 'sig-2' : 'pantry-2'
      const data = table === 'signatures'
        ? { ...signature, ...(write?.payload ?? {}), id: write?.kind === 'insert' ? insertedId : signature.id }
        : { ...pantry, ...(write?.payload ?? {}), id: write?.kind === 'insert' ? insertedId : pantry.id }
      if (write?.kind === 'insert') {
        const rows = table === 'signatures' ? signatureRows : pantryRows
        rows.push(data)
      }
      return Promise.resolve({ data, error: null })
    }),
    delete: jest.fn(() => {
      write = { table, kind: 'delete', payload: {} }
      writes.push(write)
      return chain
    }),
  }
  return chain
}

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: (table: string) => builder(table) }),
}))

beforeEach(() => {
  writes = []
  signatureRows = [{ ...signature }, { ...savedPreset }]
  pantryRows = [{ ...pantry }]
  localStorage.setItem('sofra_user_id', 'chef-1')
  global.fetch = jest.fn(async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { kind?: string }
    return {
      ok: true,
      json: async () => body.kind === 'signature'
        ? { tags: ['main', 'rich'], allergens: [] }
        : { tags: ['savory'], allergens: [] },
    } as Response
  })
})

test('signature picker exposes Main while pantry has no role controls or legacy role chip', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Roast Chicken' })

  fireEvent.change(screen.getByPlaceholderText('Add a signature dish…'), { target: { value: 'Test dish' } })
  expect(screen.queryByRole('button', { name: 'Main' })).not.toBeInTheDocument()
  expect(screen.getByText('Finding suggested tags...')).toBeInTheDocument()
  const main = await screen.findByRole('button', { name: 'Main' })
  expect(main).toBeInTheDocument()
  expect(main).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText(/review or adjust them/i)).toBeInTheDocument()

  const pantryCard = screen.getByText("This week’s pantry").parentElement?.parentElement
  expect(pantryCard).toBeTruthy()
  expect(within(pantryCard as HTMLElement).queryByText('Role')).not.toBeInTheDocument()
  expect(within(pantryCard as HTMLElement).queryByText('Main')).not.toBeInTheDocument()
  expect(within(pantryCard as HTMLElement).queryByText('Savory')).not.toBeInTheDocument()
})

test('saved signatures and pantry items render once as active chips', async () => {
  render(<KitchenPage />)

  const savedSignature = await screen.findByRole('button', { name: 'Roast Chicken' })
  const savedPantry = await screen.findByRole('button', { name: 'Tomato' })

  expect(savedSignature).toHaveAttribute('aria-pressed', 'true')
  expect(savedPantry).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getAllByRole('button', { name: 'Roast Chicken' })).toHaveLength(1)
  expect(screen.getAllByRole('button', { name: 'Tomato' })).toHaveLength(1)
})

test('rehydrates a saved preset with the exact filled pending-selection style', async () => {
  render(<KitchenPage />)

  const saved = await screen.findByRole('button', { name: 'Baba Ganoush' })
  expect(saved).toHaveAttribute('aria-pressed', 'true')
  expect(saved).toHaveStyle({ background: '#5C1515', color: 'var(--sf-intel-on-burgundy)' })
})

test('renders a saved pantry preset with visible selected text colors', async () => {
  render(<KitchenPage />)
  const tomato = await screen.findByRole('button', { name: 'Tomato' })
  expect(tomato).toHaveStyle({ background: '#5C1515', color: 'var(--sf-intel-on-burgundy)' })
})

test('inactive Kitchen chips use the theme primary text color in dark mode', async () => {
  render(<KitchenPage />)
  const guacamole = await screen.findByRole('button', { name: 'Guacamole' })
  expect(guacamole).toHaveStyle({ color: 'var(--sf-intel-text)' })
  expect(guacamole.style.border).toBe('1px solid var(--sf-intel-text)')
})

test('stages preset changes until the single signatures UPDATE action', async () => {
  render(<KitchenPage />)
  const hummus = await screen.findByRole('button', { name: 'Hummus' })

  const signatureCard = screen.getByText('Your signatures').parentElement?.parentElement
  expect(within(signatureCard as HTMLElement).queryByRole('button', { name: /Add selected/i })).not.toBeInTheDocument()
  expect(within(signatureCard as HTMLElement).getByRole('button', { name: 'UPDATE' })).toBeDisabled()
  fireEvent.click(hummus)
  expect(hummus).toHaveAttribute('aria-pressed', 'true')
  expect(writes.some(write => write.kind === 'insert')).toBe(false)
  fireEvent.click(within(signatureCard as HTMLElement).getByRole('button', { name: 'UPDATE' }))

  await waitFor(() => expect(writes.some(write => write.table === 'signatures' && write.kind === 'insert')).toBe(true))
})

test('preset picker shows a preset-derived signature under its current (renamed) name, not the stale preset label', async () => {
  // Simulates a signature that was originally quick-added from the "Hummus"
  // preset and later renamed via "Edit a saved signature" -- the update only
  // ever touches name/tags/allergens, never preset_key, so the picker must
  // key off the live row's name rather than the static preset library name.
  signatureRows.push({
    id: 'sig-renamed-hummus',
    name: "Grandma's Hummus",
    tags: ['starter', 'veg'],
    contains_allergens: [],
    preset_key: 'Levantine::hummus',
  })

  render(<KitchenPage />)

  const renamed = await screen.findByRole('button', { name: "Grandma's Hummus" })
  expect(renamed).toHaveAttribute('aria-pressed', 'true')
  expect(screen.queryByRole('button', { name: 'Hummus' })).not.toBeInTheDocument()
})

test('creating and editing a signature persists the raw main role', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Roast Chicken' })

  fireEvent.change(screen.getByPlaceholderText('Add a signature dish…'), {
    target: { value: 'Lamb Shoulder' },
  })
  const signatureCard = document.querySelector('.sv2-kitchen-signatures') as HTMLElement
  await waitFor(() => expect(screen.getByRole('button', { name: 'Main' })).toHaveAttribute('aria-pressed', 'true'))
  expect(writes.some((write) => write.table === 'signatures' && write.kind === 'insert')).toBe(false)
  fireEvent.click(within(signatureCard).getByRole('button', { name: 'UPDATE' }))

  await waitFor(() => expect(writes.some((write) =>
    write.table === 'signatures'
      && write.kind === 'insert'
      && (write.payload.tags as string[]).includes('main')
  )).toBe(true))

  fireEvent.change(screen.getByLabelText('Edit a saved signature'), {
    target: { value: signature.id },
  })
  expect(screen.getByRole('button', { name: 'Main' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Fresh' }))
  fireEvent.click(within(signatureCard).getByRole('button', { name: 'UPDATE' }))

  await waitFor(() => expect(writes.some((write) =>
    write.table === 'signatures'
      && write.kind === 'update'
      && (write.payload.tags as string[]).includes('main')
      && (write.payload.tags as string[]).includes('room_temperature')
  )).toBe(true))
})

test('pantry update strips legacy roles and keeps raw descriptive tags', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Tomato' })
  fireEvent.change(screen.getByLabelText('Edit a saved pantry item'), {
    target: { value: pantry.id },
  })
  const pantryCard = document.querySelector('.sv2-kitchen-pantry') as HTMLElement
  fireEvent.click(within(pantryCard).getByRole('button', { name: 'UPDATE' }))

  await waitFor(() => {
    const update = writes.find((write) => write.table === 'pantry_items' && write.kind === 'update')
    expect(update?.payload.tags).toEqual(['savory'])
  })
})

test('adding a pantry item persists binary availability without quantity or unit', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Tomato' })

  fireEvent.change(screen.getByPlaceholderText('Add an ingredient…'), { target: { value: 'Chicken' } })
  const pantryCard = document.querySelector('.sv2-kitchen-pantry') as HTMLElement
  await waitFor(() => expect(screen.getByRole('button', { name: 'Savory' })).toHaveAttribute('aria-pressed', 'true'))
  fireEvent.click(within(pantryCard).getByRole('button', { name: 'UPDATE' }))

  await waitFor(() => {
    const insert = writes.find((write) => write.table === 'pantry_items' && write.kind === 'insert')
    expect(insert?.payload.name).toBe('Chicken')
    expect(insert?.payload).not.toHaveProperty('quantity_amount')
    expect(insert?.payload).not.toHaveProperty('quantity_unit')
  })
})

test('does not render pantry quantity or unit controls', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Tomato' })

  expect(screen.queryByLabelText('Quantity amount')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Quantity unit')).not.toBeInTheDocument()
})

test('offers clear-all controls for signatures and pantry, with the empty pantry action on submit', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Tomato' })
  const signatureCard = document.querySelector('.sv2-kitchen-signatures') as HTMLElement
  const pantryCard = document.querySelector('.sv2-kitchen-pantry') as HTMLElement
  expect(within(signatureCard).getByRole('button', { name: 'CLEAR ALL' })).toBeInTheDocument()
  fireEvent.click(within(pantryCard).getByRole('button', { name: 'CLEAR ALL' }))
  expect(within(pantryCard).getByRole('button', { name: 'Tomato' })).toHaveAttribute('aria-pressed', 'false')
  expect(within(pantryCard).queryByRole('button', { name: 'I HAVE NOTHING' })).not.toBeInTheDocument()
  fireEvent.click(within(pantryCard).getByRole('button', { name: 'I LITERALLY HAVE NOTHING' }))
  await waitFor(() => expect(writes.some((write) => write.table === 'pantry_items' && write.kind === 'delete')).toBe(true))
})

test('a pantry selection immediately replaces the empty action and stays selected when filtered out of view', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Tomato' })
  const pantryCard = document.querySelector('.sv2-kitchen-pantry') as HTMLElement

  fireEvent.click(within(pantryCard).getByRole('button', { name: 'CLEAR ALL' }))
  expect(within(pantryCard).getByRole('button', { name: 'I LITERALLY HAVE NOTHING' })).toBeInTheDocument()

  fireEvent.click(within(pantryCard).getByRole('button', { name: 'Chicken thighs' }))
  expect(within(pantryCard).queryByRole('button', { name: 'I LITERALLY HAVE NOTHING' })).not.toBeInTheDocument()

  fireEvent.click(within(pantryCard).getByRole('button', { name: 'Fruits' }))
  expect(within(pantryCard).queryByRole('button', { name: 'Chicken thighs' })).not.toBeInTheDocument()
  expect(within(pantryCard).queryByRole('button', { name: 'I LITERALLY HAVE NOTHING' })).not.toBeInTheDocument()
})
