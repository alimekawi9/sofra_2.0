import { render, screen } from '@testing-library/react'
import { InviteCard } from '@/components/sofra-v2/InviteCard'

describe('InviteCard', () => {
  it('renders a normal apostrophe and does not duplicate guests with fallback initials', () => {
    const { container } = render(
      <InviteCard
        loading={false}
        error=""
        onRetry={jest.fn()}
        title="Dinner"
        note={null}
        hostName="Host"
        hostId="host-1"
        hostPhotoUrl={null}
        dateLabel="Date undecided"
        timeLabel="Time undecided"
        venue="Somewhere"
        dressCode={null}
        unlocked
        guests={[
          { id: 'guest-1', name: 'Tiara', photoUrl: null },
          { id: 'guest-2', name: 'Ali', photoUrl: '/ali.jpg' },
        ]}
        submitting={false}
        onRespond={jest.fn()}
      />,
    )

    expect(screen.getByText("YOU'RE INVITED TO")).toBeInTheDocument()
    expect(screen.queryByText('YOU&apos;RE INVITED TO')).not.toBeInTheDocument()
    expect(screen.getByText('Tiara')).toBeInTheDocument()
    expect(screen.queryByText('T')).not.toBeInTheDocument()
    expect(container.querySelector('.sv2-invite-guests .sv2-album-avatar-initials')).toBeNull()
    expect(container.querySelector('.sv2-invite-guests img.sv2-album-avatar')).toBeInTheDocument()
  })
})
