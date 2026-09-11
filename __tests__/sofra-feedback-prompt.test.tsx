import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SofraFeedbackPrompt } from '@/components/sofra-v2/SofraFeedbackPrompt'

it('asks only the dietary and allergy question before unlocking photos', async () => {
  const onSubmit = jest.fn(async () => true)
  render(<SofraFeedbackPrompt submitted={false} onSubmit={onSubmit} />)

  fireEvent.click(screen.getByRole('button', { name: 'ANSWER TO CONTINUE' }))

  expect(screen.getByText('Did anything you told us about your diet or allergies get missed?')).toBeInTheDocument()
  expect(screen.queryByText('Overall experience')).not.toBeInTheDocument()
  expect(screen.queryByText('How easy was participating?')).not.toBeInTheDocument()
  expect(screen.queryByText('Anything we should improve?')).not.toBeInTheDocument()

  const continueButton = screen.getByRole('button', { name: 'CONTINUE TO PHOTOS' })
  expect(continueButton).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'YES' }))
  fireEvent.click(continueButton)

  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(true))
})
