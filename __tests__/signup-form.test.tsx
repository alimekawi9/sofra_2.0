import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { SignupForm } from '@/components/sofra-v2/SignupForm'

function ControlledSignupForm() {
  const [phone, setPhone] = useState('')
  return <SignupForm phone={phone} onPhoneChange={setPhone} onSubmit={() => {}} />
}

describe('SignupForm country switching', () => {
  it('clears the entered national number when the country is changed, instead of carrying it over', async () => {
    render(<ControlledSignupForm />)

    // Default country is Egypt (+20); type a US-length number.
    await userEvent.type(screen.getByLabelText('Phone number'), '4012303966')
    expect(screen.getByLabelText('Phone number')).toHaveValue('4012303966')

    await userEvent.click(screen.getByRole('combobox', { name: 'Country code' }))
    await userEvent.click(screen.getByRole('option', { name: /United States/ }))

    // The old Egypt-context digits must not survive under the new country --
    // carrying them over previously produced nonsense numbers like
    // +20 (Egypt) + 4012303966 (a US-length number) = +204012303966.
    expect(screen.getByLabelText('Phone number')).toHaveValue('')
  })
})
