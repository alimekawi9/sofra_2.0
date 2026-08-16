import { render, waitFor } from '@testing-library/react'
import NamePage from '@/app/(auth)/name/page'
import { useRouter, useSearchParams } from 'next/navigation'

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), useSearchParams: jest.fn() }))
const replace = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  ;(useRouter as jest.Mock).mockReturnValue({ replace })
  ;(useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('next=%2Fprofile%2Fguest-1'))
})

it('redirects the legacy name route to the one canonical join flow', async () => {
  render(<NamePage />)
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/join?next=%2Fprofile%2Fguest-1'))
})
