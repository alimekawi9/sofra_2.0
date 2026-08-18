import { render, screen } from '@testing-library/react'
import ChefTabs from '@/components/ChefTabs'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: jest.fn() }),
}))

it('limits an assigned chef to Kitchen, Drafted Menu, and Recipes', () => {
  render(<ChefTabs eventId="event-1" active="kitchen" restrictedChef title="Dinner" />)
  expect(screen.getByRole('button', { name: 'Kitchen' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Drafted Menu' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Recipes' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'The Table' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Fill kitchen myself' })).not.toBeInTheDocument()
})
