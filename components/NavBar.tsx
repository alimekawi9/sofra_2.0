'use client'

import { useRouter, usePathname } from 'next/navigation'
import { C } from '@/lib/theme'

export default function NavBar() {
  const router = useRouter()
  const pathname = usePathname() || ''

  const isEvents = pathname === '/events' || pathname.startsWith('/events/')
  const isHost = pathname.startsWith('/host')
  const isProfile = pathname.startsWith('/profile')

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 76,
        background: 'rgba(10,6,7,0.82)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(243,233,221,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        zIndex: 100,
      }}
    >
      <NavBtn label="Events" icon="◈" active={isEvents} onClick={() => router.push('/events')} />
      <NavBtn label="Host" icon="＋" big active={isHost} onClick={() => router.push('/host/new')} />
      <NavBtn label="You" icon="◐" active={isProfile} onClick={() => router.push('/profile')} />
    </nav>
  )
}

function NavBtn({
  label,
  icon,
  active,
  onClick,
  big,
}: {
  label: string
  icon: string
  active?: boolean
  onClick: () => void
  big?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        opacity: active ? 1 : 0.5,
        fontFamily: 'Georgia, serif',
        padding: '4px 10px',
      }}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      <div
        style={
          big
            ? {
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: C.burgundy,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                color: C.cream,
              }
            : {
                color: C.cream,
                fontSize: 20,
              }
        }
      >
        {icon}
      </div>
      <div
        style={{
          color: C.dim,
          fontSize: 11,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {label}
      </div>
    </button>
  )
}
