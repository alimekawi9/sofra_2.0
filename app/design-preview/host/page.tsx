import '@/components/sofra-v2/sofra-v2.css'
import { HostPreview } from '@/components/sofra-v2/HostPreview'
export default function HostPage({searchParams}:{searchParams?:{mode?:string}}){return <HostPreview editMode={searchParams?.mode==='edit'}/>}
