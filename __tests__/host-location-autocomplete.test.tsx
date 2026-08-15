import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { HostLocationAutocomplete, type PreviewPlace } from '@/components/sofra-v2/HostLocationAutocomplete'

function Harness({ onPlaceSelect = jest.fn() }: { onPlaceSelect?: (place: PreviewPlace | null) => void }) {
  const [value, setValue] = useState('')
  return <HostLocationAutocomplete value={value} onChange={setValue} onPlaceSelect={onPlaceSelect} />
}

beforeEach(() => {
  jest.restoreAllMocks()
})

afterEach(() => {
  delete (global as unknown as { fetch?: typeof fetch }).fetch
})

it('debounces location lookup, limits the dropdown to five, and fills a selected address', async () => {
  const results = Array.from({ length: 7 }, (_, index) => ({
    placeId: String(index),
    text: `Place ${index}, Cairo, Egypt`,
    mainText: `Place ${index}`,
    secondaryText: 'Cairo, Egypt',
    latitude: 30 + index,
    longitude: 31 + index,
  }))
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results }),
  } as Response)
  global.fetch = fetchMock
  const onPlaceSelect = jest.fn()
  render(<Harness onPlaceSelect={onPlaceSelect} />)

  await userEvent.type(screen.getByRole('combobox'), 'Place')
  expect(fetchMock).not.toHaveBeenCalled()
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 1000 })
  expect(screen.getAllByRole('option')).toHaveLength(5)

  await userEvent.click(screen.getByRole('option', { name: /Place 0/i }))
  expect(screen.getByRole('combobox')).toHaveValue('Place 0, Cairo, Egypt')
  expect(onPlaceSelect).toHaveBeenLastCalledWith(expect.objectContaining({
    venueName: 'Place 0',
    formattedAddress: 'Place 0, Cairo, Egypt',
  }))
})

it('keeps manual entry usable when suggestions fail', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 } as Response)
  render(<Harness />)

  await userEvent.type(screen.getByRole('combobox'), 'My handwritten address')
  await waitFor(() => expect(screen.getByText(/suggestions are unavailable/i)).toBeInTheDocument(), { timeout: 1000 })
  expect(screen.getByRole('combobox')).toHaveValue('My handwritten address')
})
