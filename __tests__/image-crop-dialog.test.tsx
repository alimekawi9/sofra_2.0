import { fireEvent, render, screen } from '@testing-library/react'
import { ImageCropDialog, calculateCoverCrop } from '@/components/sofra-v2/ImageCropDialog'

beforeEach(() => {
  global.URL.createObjectURL = jest.fn(() => 'blob:crop-preview')
  global.URL.revokeObjectURL = jest.fn()
})

it('provides zoom and two-axis positioning controls before upload', () => {
  const onCancel = jest.fn()
  render(
    <ImageCropDialog
      file={new File(['image'], 'portrait.jpg', { type: 'image/jpeg' })}
      title="Crop your profile photo"
      aspectRatio={1}
      outputWidth={800}
      outputHeight={800}
      onCancel={onCancel}
      onConfirm={jest.fn()}
    />,
  )

  expect(screen.getByRole('dialog', { name: 'Crop your profile photo' })).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Image zoom'), { target: { value: '2' } })
  fireEvent.change(screen.getByLabelText('Horizontal image position'), { target: { value: '20' } })
  fireEvent.change(screen.getByLabelText('Vertical image position'), { target: { value: '80' } })
  expect(screen.getByAltText('Crop preview')).toHaveStyle({ objectPosition: '20% 80%', transform: 'scale(2)' })
  fireEvent.click(screen.getByRole('button', { name: 'CANCEL' }))
  expect(onCancel).toHaveBeenCalled()
})

it('calculates a centered cover crop and lets positioning reach either edge', () => {
  const centered = calculateCoverCrop({ sourceWidth: 2000, sourceHeight: 1000, outputWidth: 800, outputHeight: 800, zoom: 1, horizontal: 50, vertical: 50 })
  expect(centered).toEqual({ x: -400, y: 0, width: 1600, height: 800 })
  expect(calculateCoverCrop({ sourceWidth: 2000, sourceHeight: 1000, outputWidth: 800, outputHeight: 800, zoom: 1, horizontal: 0, vertical: 50 }).x).toBe(0)
  expect(calculateCoverCrop({ sourceWidth: 2000, sourceHeight: 1000, outputWidth: 800, outputHeight: 800, zoom: 1, horizontal: 100, vertical: 50 }).x).toBe(-800)
})
