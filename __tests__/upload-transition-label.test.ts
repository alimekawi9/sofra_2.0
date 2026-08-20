import { uploadTransitionLabel } from '@/components/sofra-v2/PhotoUploadProgress'

describe('uploadTransitionLabel', () => {
  it('shows live completed/total progress while uploading', () => {
    expect(uploadTransitionLabel({ status: 'uploading', completed: 2, total: 7 })).toBe('Uploading 2 of 7 photos')
  })

  it('uses singular phrasing for a single photo', () => {
    expect(uploadTransitionLabel({ status: 'uploading', completed: 0, total: 1 })).toBe('Uploading 0 of 1 photo')
  })

  it('falls back to a generic label when there is no active upload state', () => {
    expect(uploadTransitionLabel(null)).toBe('Uploading photos')
  })

  it('falls back to a generic label for non-uploading states', () => {
    expect(uploadTransitionLabel({ status: 'success', total: 3 })).toBe('Uploading photos')
  })
})
