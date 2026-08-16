import { render, waitFor } from '@testing-library/react'
import LoginPage from '@/app/(auth)/login/page'
import { useRouter, useSearchParams } from 'next/navigation'

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), useSearchParams: jest.fn() }))
const replace = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  ;(useRouter as jest.Mock).mockReturnValue({ replace })
  ;(useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams())
})

it('redirects the legacy login route to the one canonical join flow', async () => {
  ;(useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('next=%2Fevents%2Fev-1%3Fpreferences%3D1'))
  render(<LoginPage />)
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/join?next=%2Fevents%2Fev-1%3Fpreferences%3D1'))
})

it('rejects an unsafe legacy destination', async () => {
  ;(useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('next=https%3A%2F%2Fevil.example'))
  render(<LoginPage />)
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/join?next=%2Fevents'))
})
