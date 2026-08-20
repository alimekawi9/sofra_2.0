import { generateCustomDetailId, sanitizeCustomDetails, type CustomDetailSection } from '@/lib/event-custom-details'

describe('generateCustomDetailId', () => {
  it('generates a unique id each time, prefixed with d_', () => {
    const a = generateCustomDetailId()
    const b = generateCustomDetailId()
    expect(a).toMatch(/^d_/)
    expect(b).toMatch(/^d_/)
    expect(a).not.toEqual(b)
  })
})

describe('sanitizeCustomDetails', () => {
  it('trims whitespace from kept sections', () => {
    const input: CustomDetailSection[] = [{ id: '1', label: '  Parking  ', body: '  Free lot behind the theater  ' }]
    expect(sanitizeCustomDetails(input)).toEqual([{ id: '1', label: 'Parking', body: 'Free lot behind the theater' }])
  })

  it('drops a section with an empty label', () => {
    const input: CustomDetailSection[] = [{ id: '1', label: '   ', body: 'Some body' }]
    expect(sanitizeCustomDetails(input)).toEqual([])
  })

  it('drops a section with an empty body', () => {
    const input: CustomDetailSection[] = [{ id: '1', label: 'Parking', body: '   ' }]
    expect(sanitizeCustomDetails(input)).toEqual([])
  })

  it('keeps multiple valid sections in their original order', () => {
    const input: CustomDetailSection[] = [
      { id: '1', label: 'Parking', body: 'Free lot' },
      { id: '2', label: 'Gift registry', body: 'No gifts, just bring an appetite' },
    ]
    expect(sanitizeCustomDetails(input)).toEqual(input)
  })

  it('returns an empty array unchanged', () => {
    expect(sanitizeCustomDetails([])).toEqual([])
  })
})
