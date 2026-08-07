'use client'

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
        return <Link key={item.href} href={item.href} className={active?'sf-production-nav-current':undefined} aria-current={active?'page':undefined}>{item.label}</Link>
      })}
    </div>
  </nav>
}
