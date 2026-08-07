import '@/components/sofra-v2/sofra-v2.css'
import { EventsDashboard } from '@/components/sofra-v2/EventsDashboard'

export default function DesignPreviewEventsPage({searchParams}:{searchParams?:{tab?:string}}) {
  const tab=searchParams?.tab
  const initialFilter=tab==='hosting'||tab==='going'||tab==='went'?tab:'invited'
  return <EventsDashboard initialFilter={initialFilter} />
}
