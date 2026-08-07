import '@/components/sofra-v2/sofra-v2.css'
import { EventDetailPreview } from '@/components/sofra-v2/EventDetailPreview'

export default function DesignPreviewEventDetailPage({searchParams}:{searchParams?:{role?:string;state?:string}}) {
  return <EventDetailPreview role={searchParams?.role==='host'?'host':'guest'} state={searchParams?.state==='past'?'past':'upcoming'} />
}
