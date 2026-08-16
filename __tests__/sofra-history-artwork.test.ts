import { sofraHistoryArtwork } from '@/components/sofra-v2/SofraHistoryArtwork'

it('starts with burgundy, uses eight designs, then repeats the cycle', () => {
  expect(sofraHistoryArtwork(0)).toBe('/sofra/profile-lace/burgundy.png')
  expect(new Set(Array.from({ length: 8 }, (_, index) => sofraHistoryArtwork(index))).size).toBe(8)
  expect(sofraHistoryArtwork(8)).toBe(sofraHistoryArtwork(0))
  expect(sofraHistoryArtwork(9)).toBe(sofraHistoryArtwork(1))
})
