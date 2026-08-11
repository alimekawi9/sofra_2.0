import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import KitchenPage from '@/app/(chef)/kitchen/page'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

type Write = { table: string; kind: 'insert' | 'update'; payload: Record<string, unknown> }
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

function builder(table: string) {
  let write: Write | null = null
  const chain: Record<string, jest.Mock> & { then?: Promise<unknown>['then'] } = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    order: jest.fn(() => Promise.resolve({
      data: table === 'signatures' ? [signature, savedPreset] : [pantry],
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
    single: jest.fn(() => Promise.resolve({
      data: table === 'signatures'
        ? { ...signature, ...(write?.payload ?? {}), id: write?.kind === 'insert' ? 'sig-2' : signature.id }
        : { ...pantry, ...(write?.payload ?? {}), id: write?.kind === 'insert' ? 'pantry-2' : pantry.id },
      error: null,
    })),
    delete: jest.fn(() => chain),
  }
  return chain
}

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: (table: string) => builder(table) }),
}))

beforeEach(() => {
  writes = []
  localStorage.setItem('sofra_user_id', 'chef-1')
})

test('signature picker exposes Main while pantry has no role controls or legacy role chip', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Roast Chicken' })

  fireEvent.change(screen.getByPlaceholderText('Add a signature dish…'), { target: { value: 'Test dish' } })
  const main = screen.getByRole('button', { name: 'Main' })
  expect(main).toBeInTheDocument()

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
  expect(saved).toHaveStyle({ background: '#5C1515', color: '#F7F4ED' })
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

test('creating and editing a signature persists the raw main role', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Roast Chicken' })

  fireEvent.change(screen.getByPlaceholderText('Add a signature dish…'), {
    target: { value: 'Lamb Shoulder' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Main' }))
  fireEvent.click(screen.getByRole('button', { name: 'Rich' }))
  expect(writes.some((write) => write.table === 'signatures' && write.kind === 'insert')).toBe(false)
  const signatureCard = document.querySelector('.sv2-kitchen-signatures') as HTMLElement
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

test('adding a pantry item with no quantity entered saves null amount/unit (binary presence keeps working)', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Tomato' })

  fireEvent.change(screen.getByPlaceholderText('Add an ingredient…'), { target: { value: 'Chicken' } })
  fireEvent.click(screen.getByRole('button', { name: 'Savory' }))
  const pantryCard = document.querySelector('.sv2-kitchen-pantry') as HTMLElement
  fireEvent.click(within(pantryCard).getByRole('button', { name: 'UPDATE' }))

  await waitFor(() => {
    const insert = writes.find((write) => write.table === 'pantry_items' && write.kind === 'insert')
    expect(insert?.payload).toMatchObject({ quantity_amount: null, quantity_unit: null })
  })
})

test('adding a pantry item with a quantity entered saves the amount and unit', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Tomato' })

  fireEvent.change(screen.getByPlaceholderText('Add an ingredient…'), { target: { value: 'Chicken' } })
  fireEvent.change(screen.getByLabelText('Quantity amount'), { target: { value: '2' } })
  fireEvent.change(screen.getByLabelText('Quantity unit'), { target: { value: 'lbs' } })
  fireEvent.click(screen.getByRole('button', { name: 'Savory' }))
  const pantryCard = document.querySelector('.sv2-kitchen-pantry') as HTMLElement
  fireEvent.click(within(pantryCard).getByRole('button', { name: 'UPDATE' }))

  await waitFor(() => {
    const insert = writes.find((write) => write.table === 'pantry_items' && write.kind === 'insert')
    expect(insert?.payload).toMatchObject({ quantity_amount: 2, quantity_unit: 'lbs' })
  })
})

test('editing a saved pantry item with no quantity leaves the quantity fields blank', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Tomato' })
  fireEvent.change(screen.getByLabelText('Edit a saved pantry item'), {
    target: { value: pantry.id },
  })

  expect(screen.getByLabelText('Quantity amount')).toHaveValue(null)
  expect(screen.getByLabelText('Quantity unit')).toHaveValue('')
})
