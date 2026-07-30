import NavBar from '@/components/NavBar'
import type { ReactNode } from 'react'

export default function HostLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <NavBar />
      {children}
    </>
  )
}
