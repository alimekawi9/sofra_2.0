'use client'
import {useRouter} from 'next/navigation'
import {resetPreviewSession,updatePreviewSession} from './preview-session'
export function PreviewStartActions(){const router=useRouter();function start(role:'guest'|'host'|null,path:string){resetPreviewSession();if(role)updatePreviewSession({role});router.push(path)}return <section className="sv2-demo-start" aria-label="Preview demo starts"><button type="button" onClick={()=>start(null,'/design-preview/welcome')}>START FULL DEMO</button><p>Developer shortcuts</p><div><button type="button" onClick={()=>start('guest','/design-preview/events?tab=invited')}>START AS GUEST</button><button type="button" onClick={()=>start('host','/design-preview/events?tab=hosting')}>START AS HOST</button></div></section>}
