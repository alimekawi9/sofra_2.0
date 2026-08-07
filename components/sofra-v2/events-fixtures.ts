export type PreviewEventStatus = 'going' | 'went' | 'hosted'

export interface PreviewEvent {
  id: string; title: string; host: string; date: string; time: string; location: string
  dressCode: string; status: PreviewEventStatus; seats: string; rsvpStatus: string; artwork: string
}

export const PREVIEW_EVENTS: readonly PreviewEvent[] = [
  { id:'alis-sofra', title:"Ali's Sofra", host:'Ali Mansour', date:'Sun, Aug 3', time:'8:00 PM', location:'Kona · Boston, MA', dressCode:'Warm colors and easy layers', status:'going', seats:'6 seats left', rsvpStatus:'Going', artwork:'Pomegranate evening' },
  { id:'laylas-sofra', title:"Layla's Sofra", host:'Layla Hassan', date:'Fri, Aug 15', time:'6:30 PM', location:'Krasi · Boston, MA', dressCode:'Dinner-bright, no jackets required', status:'hosted', seats:'3 seats left', rsvpStatus:'Hosting', artwork:'Golden arabesque' },
  { id:'nadias-club', title:"Nadia's Supper Club", host:'Nadia Rahal', date:'Jul 2', time:'7:30 PM', location:'Sarma · Somerville, MA', dressCode:'A touch of red', status:'went', seats:'9 attended', rsvpStatus:'Attended', artwork:'Summer tile' },
] as const

export const DEMO_EVENT = {
  ...PREVIEW_EVENTS[1],
  note:'A table set with love for the people I love. Join me for an evening of good food, warm conversation, and Middle Eastern hospitality.',
  guests:[
    { initials:'LH', name:'Layla', responded:true, summary:'No shellfish · loves savory food' },
    { initials:'AK', name:'Alia', responded:true, summary:'Vegetarian · bright, herbal flavors' },
    { initials:'MR', name:'Mona', responded:false },
    { initials:'OS', name:'Omar', responded:false },
    { initials:'SA', name:'Sam', responded:true, summary:'Fish · adventurous' },
  ],
  preferenceSummary:{ completed:'3 of 5 responses complete', dietary:'1 vegetarian guest', avoided:'Shellfish and nuts', proteins:'Fish, vegetable-forward, beef or lamb', flavors:'Savory, bright, and herbal', bravery:'72 / 100' },
} as const
