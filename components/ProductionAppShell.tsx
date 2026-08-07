import type {ReactNode} from 'react'
import NavBar from './NavBar'

/**
 * Shared production presentation shell. Authentication and authorization
 * hardening is deliberately deferred; this component does not change the
 * existing localStorage identity model.
 */
export default function ProductionAppShell({children}:{children:ReactNode}){
  return <div className="sf-production-app">
    <div className="sf-production-content">{children}</div>
    <NavBar/>
  </div>
}
