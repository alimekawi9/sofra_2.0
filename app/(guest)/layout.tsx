import NavBar from '@/components/NavBar'
import type { ReactNode } from 'react'

export default function GuestLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <NavBar />
      {children}
    </>
  )
}
