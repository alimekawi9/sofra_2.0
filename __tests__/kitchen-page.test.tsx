import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import KitchenPage from '@/app/(chef)/kitchen/page'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

jest.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: (_target, tag) => tag }),
  useScroll: () => ({ scrollYProgress: { on: () => () => {}, get: () => 0 } }),
  useTransform: () => 0,
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

// Lets a test force a specific delete (by row id) to fail server-side, so
// partial-batch-failure reconciliation can be exercised: the row must NOT be
// filtered out of the mock "server" rows, and the resolved value must carry
// an error so submitKitchen's per-operation success check sees it as failed.
let failDeleteIds = new Set<string>()

function applyUpdate(table: string, id: string, payload: Record<string, unknown>) {
  const rows = table === 'signatures' ? signatureRows : pantryRows
  const idx = rows.findIndex((r) => r.id === id)
  if (idx !== -1) rows[idx] = { ...rows[idx], ...payload }
}

function builder(table: string) {
  let write: Write | null = null
  const chain: Record<string, jest.Mock> & { then?: Promise<unknown>['then']; error?: unknown } = {
    select: jest.fn(() => chain),
    eq: jest.fn((col: string, val: string) => {
      if (col === 'id' && write?.kind === 'update') applyUpdate(table, val, write.payload)
      if (col === 'id' && write?.kind === 'delete') {
        if (failDeleteIds.has(val)) {
          chain.error = { message: 'boom' }
        } else {
          if (table === 'pantry_items') pantryRows = pantryRows.filter((row) => row.id !== val)
          if (table === 'signatures') signatureRows = signatureRows.filter((row) => row.id !== val)
        }
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
  failDeleteIds = new Set()
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

test('stages preset changes until the single shared submit action', async () => {
  render(<KitchenPage />)
  const hummus = await screen.findByRole('button', { name: 'Hummus' })

  fireEvent.click(hummus)
  expect(hummus).toHaveAttribute('aria-pressed', 'true')
  expect(writes.some(write => write.kind === 'insert')).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'UPDATE' }))

  await waitFor(() => expect(writes.some(write => write.table === 'signatures' && write.kind === 'insert')).toBe(true))
})

test('preset picker shows a preset-derived signature under its current stored name, not the stale preset label', async () => {
  // Simulates a legacy signature whose stored name differs from the preset.
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

test('creating a signature persists the raw main role and hides saved-signature editing', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Roast Chicken' })

  fireEvent.change(screen.getByPlaceholderText('Add a signature dish…'), {
    target: { value: 'Lamb Shoulder' },
  })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Main' })).toHaveAttribute('aria-pressed', 'true'))
  expect(writes.some((write) => write.table === 'signatures' && write.kind === 'insert')).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'UPDATE' }))

  await waitFor(() => expect(writes.some((write) =>
    write.table === 'signatures'
      && write.kind === 'insert'
      && (write.payload.tags as string[]).includes('main')
  )).toBe(true))
  expect(screen.queryByLabelText('Edit a saved signature')).not.toBeInTheDocument()
})

test('adding a pantry item persists binary availability without quantity or unit', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Tomato' })

  fireEvent.change(screen.getByPlaceholderText('Add an ingredient…'), { target: { value: 'Chicken' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Savory' })).toHaveAttribute('aria-pressed', 'true'))
  fireEvent.click(screen.getByRole('button', { name: 'UPDATE' }))

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
  expect(screen.queryByRole('button', { name: 'I HAVE NOTHING' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'I LITERALLY HAVE NOTHING' }))
  await waitFor(() => expect(writes.some((write) => write.table === 'pantry_items' && write.kind === 'delete')).toBe(true))
})

test('a pantry selection immediately replaces the empty action and stays selected when filtered out of view', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Tomato' })
  const pantryCard = document.querySelector('.sv2-kitchen-pantry') as HTMLElement

  fireEvent.click(within(pantryCard).getByRole('button', { name: 'CLEAR ALL' }))
  expect(screen.getByRole('button', { name: 'I LITERALLY HAVE NOTHING' })).toBeInTheDocument()

  fireEvent.click(within(pantryCard).getByRole('button', { name: 'Chicken thighs' }))
  expect(screen.queryByRole('button', { name: 'I LITERALLY HAVE NOTHING' })).not.toBeInTheDocument()

  fireEvent.click(within(pantryCard).getByRole('button', { name: 'Fruits' }))
  expect(within(pantryCard).queryByRole('button', { name: 'Chicken thighs' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'I LITERALLY HAVE NOTHING' })).not.toBeInTheDocument()
})

test('clicking a saved pantry chip stages its removal instead of deleting immediately', async () => {
  render(<KitchenPage />)
  const tomato = await screen.findByRole('button', { name: 'Tomato' })

  fireEvent.click(tomato)
  expect(tomato).toHaveAttribute('aria-pressed', 'false')
  expect(writes.some((write) => write.table === 'pantry_items' && write.kind === 'delete')).toBe(false)

  fireEvent.click(screen.getByRole('button', { name: 'UPDATE' }))
  await waitFor(() => expect(writes.some((write) => write.table === 'pantry_items' && write.kind === 'delete')).toBe(true))
})

test('there is no way to reopen a saved pantry item for editing', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Tomato' })
  expect(screen.queryByLabelText('Edit a saved pantry item')).not.toBeInTheDocument()
})

test('submit label reflects pending signature changes even when the pantry is empty', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Tomato' })
  const pantryCard = document.querySelector('.sv2-kitchen-pantry') as HTMLElement

  fireEvent.click(within(pantryCard).getByRole('button', { name: 'CLEAR ALL' }))
  expect(screen.getByRole('button', { name: 'I LITERALLY HAVE NOTHING' })).toBeInTheDocument()

  fireEvent.change(screen.getByPlaceholderText('Add a signature dish…'), { target: { value: 'Lamb Shoulder' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Main' })).toHaveAttribute('aria-pressed', 'true'))

  expect(screen.queryByRole('button', { name: 'I LITERALLY HAVE NOTHING' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'UPDATE' })).toBeInTheDocument()
})

test('CLEAR ALL resets a previously staged pantry removal', async () => {
  render(<KitchenPage />)
  const tomato = await screen.findByRole('button', { name: 'Tomato' })
  const pantryCard = document.querySelector('.sv2-kitchen-pantry') as HTMLElement

  fireEvent.click(tomato)
  expect(tomato).toHaveAttribute('aria-pressed', 'false')

  fireEvent.click(within(pantryCard).getByRole('button', { name: 'CLEAR ALL' }))
  expect(screen.getByRole('button', { name: 'I LITERALLY HAVE NOTHING' })).toBeInTheDocument()

  fireEvent.click(within(pantryCard).getByRole('button', { name: 'Chicken thighs' }))
  expect(screen.queryByRole('button', { name: 'I LITERALLY HAVE NOTHING' })).not.toBeInTheDocument()

  expect(within(pantryCard).getByRole('button', { name: 'Tomato' })).toHaveAttribute('aria-pressed', 'true')
})

test('a single submit batches both a new preset signature insert and a staged pantry removal', async () => {
  render(<KitchenPage />)
  const hummus = await screen.findByRole('button', { name: 'Hummus' })
  const tomato = await screen.findByRole('button', { name: 'Tomato' })

  fireEvent.click(hummus)
  fireEvent.click(tomato)

  fireEvent.click(screen.getByRole('button', { name: 'UPDATE' }))

  await waitFor(() => {
    expect(writes.some((write) =>
      write.table === 'signatures' && write.kind === 'insert' && write.payload.name === 'Hummus'
    )).toBe(true)
    expect(writes.some((write) => write.table === 'pantry_items' && write.kind === 'delete')).toBe(true)
  })
})

test('partial batch failure keeps only the failed operation pending after reconciling with the server', async () => {
  render(<KitchenPage />)
  const hummus = await screen.findByRole('button', { name: 'Hummus' })
  const tomato = await screen.findByRole('button', { name: 'Tomato' })

  fireEvent.click(hummus)
  fireEvent.click(tomato)
  expect(tomato).toHaveAttribute('aria-pressed', 'false')

  failDeleteIds.add('pantry-1')

  fireEvent.click(screen.getByRole('button', { name: 'UPDATE' }))

  await waitFor(() => expect(screen.getByText(/Some changes saved, but a few couldn't/i)).toBeInTheDocument())

  // The succeeded signature insert committed and is no longer a pending selection —
  // loadData()'s refresh now shows it as an already-saved chip.
  const hummusAfter = await screen.findByRole('button', { name: 'Hummus' })
  expect(hummusAfter).toHaveAttribute('aria-pressed', 'true')

  // The failed pantry removal remains staged so the user can retry it.
  expect(screen.getByRole('button', { name: 'Tomato' })).toHaveAttribute('aria-pressed', 'false')
})
