import { render, screen } from '@testing-library/react'
import { InviteLanding } from '@/components/sofra-v2/InviteLanding'

describe('InviteLanding title fitting', () => {
  it('scales a multi-word event title to stay inside the artwork label', () => {
    render(<InviteLanding eventId="event-1" title="Layla’s Long Table — Demo" onClaimSeat={jest.fn()} />)
    expect(screen.getByRole('heading', { name: 'Layla’s Long Table — Demo' })).toHaveClass('is-long')
  })

  it('uses the smallest title treatment for unusually long names', () => {
    const title = 'A Very Long Celebration Around the Most Wonderful Table'
    render(<InviteLanding eventId="event-1" title={title} onClaimSeat={jest.fn()} />)
    expect(screen.getByRole('heading', { name: title })).toHaveClass('is-very-long')
  })
})
