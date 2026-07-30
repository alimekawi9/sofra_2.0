import NavBar from '@/components/NavBar'
import type { ReactNode } from 'react'

export default function ChefLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <NavBar />
      {children}
    </>
  )
}
