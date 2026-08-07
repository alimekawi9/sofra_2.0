import {render,screen} from '@testing-library/react'
import {usePathname} from 'next/navigation'
import ProductionAppShell from '@/components/ProductionAppShell'

jest.mock('next/navigation',()=>({usePathname:jest.fn()}))

const mockedPathname=usePathname as jest.Mock

beforeEach(()=>mockedPathname.mockReturnValue('/events'))

it('renders the approved production navigation without commerce or preview controls',()=>{
  render(<ProductionAppShell><main>Production content</main></ProductionAppShell>)
  const nav=screen.getByRole('navigation',{name:'Sofra application'})
  expect(nav).toHaveClass('sf-production-nav')
  expect(screen.getByRole('link',{name:'SOFRAS'})).toHaveAttribute('href','/events')
  expect(screen.getByRole('link',{name:'HOST'})).toHaveAttribute('href','/host/new')
  expect(screen.getByRole('link',{name:'PROFILE'})).toHaveAttribute('href','/profile')
  expect(screen.queryByText('(+)')).not.toBeInTheDocument()
  expect(screen.queryByText(/cart/i)).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/preview controls/i)).not.toBeInTheDocument()
})

it.each([
  ['/events/demo','SOFRAS'],
  ['/host/new','HOST'],
  ['/profile','PROFILE'],
])('marks %s as the active production destination',(path,label)=>{
  mockedPathname.mockReturnValue(path)
  render(<ProductionAppShell><main/></ProductionAppShell>)
  expect(screen.getByRole('link',{name:label})).toHaveAttribute('aria-current','page')
})

it('does not render an appearance control outside Profile content',()=>{
  render(<ProductionAppShell><main/></ProductionAppShell>)
  expect(screen.queryByRole('button',{name:/light|dark|theme|appearance/i})).not.toBeInTheDocument()
})
