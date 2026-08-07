import '@/components/sofra-v2/sofra-v2.css'
import { EventsDashboard } from '@/components/sofra-v2/EventsDashboard'

export default function DesignPreviewEventsPage({searchParams}:{searchParams?:{tab?:string}}) {
  const initialFilter=searchParams?.tab==='went'?'went':['hosted','hosting'].includes(searchParams?.tab??'')?'hosted':'going'
  return <EventsDashboard initialFilter={initialFilter} />
}
