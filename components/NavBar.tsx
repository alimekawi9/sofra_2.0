'use client'

import Image from 'next/image'
import Link from 'next/link'
import {usePathname} from 'next/navigation'

const ITEMS=[
  {label:'SOFRAS',href:'/events',matches:(path:string)=>path==='/events'||path.startsWith('/events/')},
  {label:'HOST',href:'/host/new',matches:(path:string)=>path.startsWith('/host')},
  {label:'PROFILE',href:'/profile',matches:(path:string)=>path.startsWith('/profile')},
] as const

export default function NavBar(){
  const pathname=usePathname()??''
  return <nav className="sf-production-nav" aria-label="Sofra application">
    <div className="sf-production-nav-inner">
      {ITEMS.map(item=>{
        const active=item.matches(pathname)
        const isHost=item.label==='HOST'
        const className=[isHost?'sf-production-nav-host':'',active?'sf-production-nav-current':''].filter(Boolean).join(' ')||undefined
        return <Link key={item.href} href={item.href} className={className} aria-current={active?'page':undefined}>
          {isHost ? (
            <span className="sf-production-nav-host-mark-wrap">
              <Image src="/sofra-table-mark.png" alt="" width={68} height={49} aria-hidden="true" className="sf-production-nav-host-mark" />
              <span className="sf-production-nav-host-label">{item.label}</span>
            </span>
          ) : item.label}
        </Link>
      })}
    </div>
  </nav>
}
