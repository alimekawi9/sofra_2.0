import ProductionAppShell from '@/components/ProductionAppShell'
import type { ReactNode } from 'react'

export default function ChefLayout({ children }: { children: ReactNode }) {
  return (
    <ProductionAppShell>{children}</ProductionAppShell>
  )
}
