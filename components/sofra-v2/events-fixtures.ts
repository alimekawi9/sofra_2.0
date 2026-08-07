export type PreviewEventStatus = 'going' | 'went' | 'hosted'

export interface PreviewEvent {
  id: string
  title: string
  host: string
  date: string
  time: string
  location: string
  mood: string
  status: PreviewEventStatus
  seats: string
}

export const PREVIEW_EVENTS: readonly PreviewEvent[] = [
  {
    id: 'alis-sofra',
    title: "Ali's Sofra",
    host: 'Ali Mansour',
    date: 'Sun, Aug 3',
    time: '8:00 PM',
    location: 'Kona · Boston, MA',
    mood: 'Warm, generous, a little lively',
    status: 'going',
    seats: '6 seats left',
  },
  {
    id: 'laylas-sofra',
    title: "Layla's Sofra",
    host: 'Layla Hassan',
    date: 'Fri, Aug 15',
    time: '6:30 PM',
    location: 'Krasi · Boston, MA',
    mood: 'Earthy, intimate, made for lingering',
    status: 'hosted',
    seats: '3 seats left',
  },
  {
    id: 'nadias-club',
    title: "Nadia's Supper Club",
    host: 'Nadia Rahal',
    date: 'Jul 2',
    time: '7:30 PM',
    location: 'Sarma · Somerville, MA',
    mood: 'Bright and celebratory',
    status: 'went',
    seats: '9 attended',
  },
] as const

export const DEMO_EVENT = {
  ...PREVIEW_EVENTS[1],
  note: 'A table set with love for the people I love. Join me for an evening of good food, warm conversation, and Middle Eastern hospitality.',
  guests: ['Layla', 'Alia', 'Mona', 'Omar', 'Sam'],
  menu: ['Heirloom tomato & labneh', 'Whole grilled sea bass', 'Lamb shoulder with freekeh', 'Burnt Basque cheesecake'],
} as const
