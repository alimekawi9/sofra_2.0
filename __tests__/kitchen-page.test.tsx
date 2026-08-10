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
      data: table === 'signatures' ? [signature] : [pantry],
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
  fireEvent.click(screen.getAllByRole('button', { name: 'Continue' })[0])
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

test('creating and editing a signature persists the raw main role', async () => {
  render(<KitchenPage />)
  await screen.findByRole('button', { name: 'Roast Chicken' })

  fireEvent.change(screen.getByPlaceholderText('Add a signature dish…'), {
    target: { value: 'Lamb Shoulder' },
  })
  fireEvent.click(screen.getAllByRole('button', { name: 'Continue' })[0])
  fireEvent.click(screen.getByRole('button', { name: 'Main' }))
  fireEvent.click(screen.getByRole('button', { name: 'Rich' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save signature' }))

  await waitFor(() => expect(writes.some((write) =>
    write.table === 'signatures'
      && write.kind === 'insert'
      && (write.payload.tags as string[]).includes('main')
  )).toBe(true))

  fireEvent.change(screen.getByLabelText('Edit a saved signature'), {
    target: { value: signature.id },
  })
  expect(screen.getByRole('button', { name: 'Main' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

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
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() => {
    const update = writes.find((write) => write.table === 'pantry_items' && write.kind === 'update')
    expect(update?.payload.tags).toEqual(['savory'])
  })
})
