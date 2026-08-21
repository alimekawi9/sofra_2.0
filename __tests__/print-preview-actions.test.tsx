import { fireEvent, render, screen } from '@testing-library/react'
import { PrintPreviewActions } from '@/components/sofra-v2/PrintPreviewActions'

it('prints the current preview directly without opening a popup window', () => {
  const print = jest.spyOn(window, 'print').mockImplementation(() => {})
  const open = jest.spyOn(window, 'open')
  render(<PrintPreviewActions label="PRINT / SAVE MENU" />)

  fireEvent.click(screen.getByRole('button', { name: 'PRINT / SAVE MENU' }))

  expect(print).toHaveBeenCalledTimes(1)
  expect(open).not.toHaveBeenCalled()
  expect(screen.getByText(/tap the browser Share button and choose Print/i)).toBeInTheDocument()
  print.mockRestore()
  open.mockRestore()
})

it('supports returning from an on-page recipe preview', () => {
  const onBack = jest.fn()
  render(<PrintPreviewActions label="PRINT / SAVE RECIPES" onBack={onBack} />)
  fireEvent.click(screen.getByRole('button', { name: 'BACK' }))
  expect(onBack).toHaveBeenCalledTimes(1)
})
