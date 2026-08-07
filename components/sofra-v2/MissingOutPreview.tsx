import Link from 'next/link'
import { sv2Display, sv2Sans } from './fonts'
export function MissingOutPreview(){return <div className={`sv2-root sv2-device-page sv2-invite-page ${sv2Display.variable} ${sv2Sans.variable}`}><main className="sv2-device-shell sv2-missing-out"><p className="sv2-event-kicker">MAYBE NEXT TIME</p><h1>You&apos;ll be missed.</h1><p>The plates will try not to take it personally.</p><div><Link href="/design-preview/invite">RETURN TO INVITATION</Link><Link href="/design-preview/events">SEE MY SOFRAS</Link></div></main></div>}
