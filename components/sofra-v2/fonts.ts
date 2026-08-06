import { Playfair_Display, DM_Sans } from 'next/font/google'

export const sv2Display = Playfair_Display({
  subsets: ['latin'],
  style: ['italic', 'normal'],
  weight: ['400'],
  variable: '--sv2-font-display',
  display: 'swap',
})

export const sv2Sans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--sv2-font-sans',
  display: 'swap',
})
