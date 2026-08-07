import '@/components/sofra-v2/sofra-v2.css'
import { MenuPreview } from '@/components/sofra-v2/MenuPreview'

export default function DesignPreviewMenuPage({ searchParams }: { searchParams?: { theme?: string } }) {
  const theme = searchParams?.theme === 'dark' ? 'dark' : 'light'
  return <MenuPreview theme={theme} />
}
