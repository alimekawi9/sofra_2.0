import {render,screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {useRouter} from 'next/navigation'
import {createClient} from '@/lib/supabase/client'
import EventsPage from '@/app/design-preview/events/page'
import EventPage from '@/app/design-preview/events/demo/page'
import InvitePage from '@/app/design-preview/invite/page'
import MissingOutPage from '@/app/design-preview/invite/missing-out/page'
import ProfilePage from '@/app/design-preview/profile/page'
import HostPage from '@/app/design-preview/host/page'
import MenuPage from '@/app/design-preview/menu/page'
import CuratedMenusPage from '@/app/design-preview/curated-menus/page'
import CuratedMenuDemoPage from '@/app/design-preview/curated-menus/demo/page'
import MyKitchenPage from '@/app/design-preview/my-kitchen/page'
import GalleryPage from '@/app/design-preview/page'

jest.mock('@/lib/supabase/client')
jest.mock('next/navigation',()=>({useRouter:jest.fn()}))
const push=jest.fn()
beforeEach(()=>{push.mockClear();sessionStorage.clear();(createClient as jest.Mock).mockClear();(useRouter as jest.Mock).mockReturnValue({push})})

it('renders Sofras without an avatar, cart, or dishes and uses shared navigation',()=>{const {container}=render(<EventsPage/>);expect(screen.getByText('YOUR SOFRAS')).toBeInTheDocument();expect(screen.getByText('SOFRAS OF THE PAST')).toBeInTheDocument();expect(container.querySelector('.sv2-avatar')).toBeNull();expect(screen.queryByText('Cart')).not.toBeInTheDocument();expect(screen.queryByText('Lamb Shoulder with Freekeh')).not.toBeInTheDocument();for(const label of ['SOFRAS','HOST (+)','PROFILE'])expect(screen.getByRole('link',{name:label})).toBeInTheDocument()})
it('shows responded event details, Dress code, locked guests, and EDIT RSVP only',()=>{render(<EventPage/>);expect(screen.getByRole('link',{name:'EDIT RSVP'})).toBeInTheDocument();expect(screen.getByText('Dress code')).toBeInTheDocument();expect(screen.queryByText('Table mood')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'SAVE ME A SEAT'})).not.toBeInTheDocument();expect(screen.getAllByText('Details unlock after RSVP')).toHaveLength(2)})
it('routes accepted and tentative RSVPs to Preferences and decline to Missing Out',async()=>{const user=userEvent.setup();render(<InvitePage/>);await user.click(screen.getByRole('button',{name:'SAVE ME A SEAT'}));expect(sessionStorage.getItem('sofra-preview-rsvp')).toBe('going');expect(push).toHaveBeenCalledWith('/design-preview/preferences');await user.click(screen.getByRole('button',{name:"I'LL THINK ABOUT IT"}));expect(sessionStorage.getItem('sofra-preview-rsvp')).toBe('tentative');await user.click(screen.getByRole('button',{name:'MAYBE NEXT TIME'}));expect(push).toHaveBeenCalledWith('/design-preview/invite/missing-out')})
it('renders the missing-out destination',()=>{render(<MissingOutPage/>);expect(screen.getByText("The plates will try not to take it personally.")).toBeInTheDocument()})
it('keeps appearance controls only on Profile and provides preview logout',()=>{const routes=[<EventsPage key="events"/>,<EventPage key="event"/>,<InvitePage key="invite"/>,<HostPage key="host"/>,<MenuPage key="menu"/>,<CuratedMenusPage key="curated"/>,<MyKitchenPage key="kitchen"/>];for(const page of routes){const view=render(page);expect(screen.queryByRole('group',{name:'Preview appearance'})).not.toBeInTheDocument();view.unmount()}render(<ProfilePage/>);expect(screen.getByRole('group',{name:'Preview appearance'})).toBeInTheDocument();expect(screen.getByRole('button',{name:'LOG OUT'})).toBeInTheDocument()})
it('renders curated menus and kitchen as text-only local collections',()=>{const index=render(<CuratedMenusPage/>);expect(screen.getByRole('heading',{name:'Curated Menus'})).toBeInTheDocument();index.unmount();const detail=render(<CuratedMenuDemoPage/>);expect(screen.getByText('Heirloom Tomato & Labneh')).toBeInTheDocument();expect(detail.container.querySelector('.sv2-menu-image-placeholder')).toBeNull();expect(screen.queryByRole('button',{name:/explore menu/i})).not.toBeInTheDocument();detail.unmount();render(<MyKitchenPage/>);expect(screen.getByRole('heading',{name:'My Kitchen'})).toBeInTheDocument();expect(screen.getByText('Signature dishes')).toBeInTheDocument();expect(createClient).not.toHaveBeenCalled()})
it('renders the host form and every requested gallery route',()=>{const host=render(<HostPage/>);expect(screen.getByRole('heading',{name:'Create a Sofra'})).toBeInTheDocument();host.unmount();render(<GalleryPage/>);for(const route of ['/design-preview/welcome','/design-preview/signup','/design-preview/name','/design-preview/preferences','/design-preview/events','/design-preview/events/demo','/design-preview/host','/design-preview/invite','/design-preview/invite/missing-out','/design-preview/curated-menus','/design-preview/curated-menus/demo','/design-preview/my-kitchen','/design-preview/profile'])expect(screen.getByText(route)).toBeInTheDocument()})
