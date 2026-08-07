'use client'
import Link from 'next/link'
import {usePathname,useRouter} from 'next/navigation'
import {useState} from 'react'
import {readPreviewSession,resetPreviewSession} from './preview-session'
export function PreviewDevControls(){const path=usePathname();const router=useRouter();const[hidden,setHidden]=useState(false);if(path==='/design-preview'||hidden)return null;const role=readPreviewSession().role;return <aside className="sv2-dev-flow" aria-label="Preview controls"><button type="button" aria-label="Hide preview controls" onClick={()=>setHidden(true)}>×</button><small>{role?`${role.toUpperCase()} · `:''}{path}</small><Link href="/design-preview">GALLERY</Link><button type="button" onClick={()=>{resetPreviewSession();router.push('/design-preview')}}>RESET DEMO</button></aside>}
