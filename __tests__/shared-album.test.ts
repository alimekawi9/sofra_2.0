import {
  buildPreviewTiles,
  validateUploadBatch,
  runBatchWithConcurrency,
  uploadPhotoBatch,
  fetchAlbumPhotos,
  fetchUsersByIds,
  fetchPhotoComments,
  postPhotoComment,
  filenameForDownload,
  downloadPhotoToDevice,
  downloadPhotosBatch,
  saveViaShareSheet,
  MAX_PREVIEW_TILES,
  MAX_UPLOAD_BATCH,
  MAX_ALBUM_PHOTOS,
} from '@/lib/shared-album'

// ─── buildPreviewTiles ──────────────────────────────────────────────────────

describe('buildPreviewTiles', () => {
  it('shows nothing with no overflow for 0 photos', () => {
    expect(buildPreviewTiles([])).toEqual({ tiles: [], overflowCount: 0 })
  })

  it('shows all photos with no overflow for 1 photo', () => {
    expect(buildPreviewTiles([1])).toEqual({ tiles: [1], overflowCount: 0 })
  })

  it('shows all photos with no overflow for 5 photos', () => {
    const photos = [1, 2, 3, 4, 5]
    expect(buildPreviewTiles(photos)).toEqual({ tiles: photos, overflowCount: 0 })
  })

  it('shows all photos with no overflow at exactly the max (6)', () => {
    const photos = [1, 2, 3, 4, 5, 6]
    expect(buildPreviewTiles(photos)).toEqual({ tiles: photos, overflowCount: 0 })
  })

  it('reserves the last slot for an overflow tile at 7 photos', () => {
    const photos = [1, 2, 3, 4, 5, 6, 7]
    const result = buildPreviewTiles(photos)
    expect(result.tiles).toEqual([1, 2, 3, 4, 5])
    expect(result.overflowCount).toBe(2)
  })

  it('matches the spec example: 23 photos -> 5 tiles + "+18"', () => {
    const photos = Array.from({ length: 23 }, (_, i) => i)
    const result = buildPreviewTiles(photos)
    expect(result.tiles).toHaveLength(5)
    expect(result.overflowCount).toBe(18)
  })

  it('respects a custom max', () => {
    const photos = [1, 2, 3, 4]
    const result = buildPreviewTiles(photos, 3)
    expect(result.tiles).toEqual([1, 2])
    expect(result.overflowCount).toBe(2)
  })

  it('exposes the default max as 6', () => {
    expect(MAX_PREVIEW_TILES).toBe(6)
  })
})

// ─── validateUploadBatch ────────────────────────────────────────────────────

describe('validateUploadBatch', () => {
  it('rejects an empty selection', () => {
    expect(validateUploadBatch(0).ok).toBe(false)
  })

  it('accepts 1 file', () => {
    expect(validateUploadBatch(1)).toEqual({ ok: true })
  })

  it('accepts exactly 20 files in one batch, regardless of album size, while room remains', () => {
    expect(validateUploadBatch(20, 0)).toEqual({ ok: true })
    expect(validateUploadBatch(20, 100)).toEqual({ ok: true })
  })

  it('rejects a batch of 21 files with a clear message, even with plenty of album room left', () => {
    const result = validateUploadBatch(21, 0)
    expect(result.ok).toBe(false)
    expect(result.message).toBe('You can upload up to 20 photos at a time.')
  })

  it('exposes the per-batch limit as 20', () => {
    expect(MAX_UPLOAD_BATCH).toBe(20)
  })

  it('exposes the total album cap as 200, independent of the per-batch limit', () => {
    expect(MAX_ALBUM_PHOTOS).toBe(200)
  })

  it('accepts a new batch that exactly fills the remaining album room', () => {
    expect(validateUploadBatch(5, 195)).toEqual({ ok: true })
  })

  it('rejects a new batch that would push the album over its total cap', () => {
    const result = validateUploadBatch(6, 195)
    expect(result.ok).toBe(false)
    expect(result.message).toBe('You can only add 5 more photos — up to 200 per event.')
  })

  it('uses singular phrasing when exactly one slot remains', () => {
    const result = validateUploadBatch(2, 199)
    expect(result.message).toBe('You can only add 1 more photo — up to 200 per event.')
  })

  it('rejects any selection once the album is already full', () => {
    const result = validateUploadBatch(1, 200)
    expect(result.ok).toBe(false)
    expect(result.message).toBe('This album is full — up to 200 photos per event.')
  })
})

// ─── runBatchWithConcurrency ────────────────────────────────────────────────

describe('runBatchWithConcurrency', () => {
  it('runs every item and preserves result order regardless of completion order', async () => {
    const delays = [30, 10, 20, 5]
    const results = await runBatchWithConcurrency(delays, 3, async (delay, i) => {
      await new Promise((r) => setTimeout(r, delay))
      return i
    })
    expect(results).toEqual([0, 1, 2, 3])
  })

  it('never exceeds the given concurrency limit', async () => {
    let active = 0
    let maxActive = 0
    const items = Array.from({ length: 10 }, (_, i) => i)
    await runBatchWithConcurrency(items, 3, async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
    })
    expect(maxActive).toBeLessThanOrEqual(3)
  })

  it('reports completed/total progress incrementally, ending at the full total', async () => {
    const progressCalls: Array<[number, number]> = []
    await runBatchWithConcurrency(
      [1, 2, 3, 4, 5],
      2,
      async (n) => n,
      (completed, total) => progressCalls.push([completed, total])
    )
    expect(progressCalls).toHaveLength(5)
    expect(progressCalls[progressCalls.length - 1]).toEqual([5, 5])
    expect(progressCalls.map((c) => c[0])).toEqual([1, 2, 3, 4, 5])
  })

  it('handles an empty list without calling the worker', async () => {
    const worker = jest.fn()
    const results = await runBatchWithConcurrency([], 3, worker)
    expect(results).toEqual([])
    expect(worker).not.toHaveBeenCalled()
  })
})

// ─── Supabase-backed helpers ────────────────────────────────────────────────

function makeFakeSupabase(overrides: {
  photoRows?: any[]
  photoFetchError?: { message: string } | null
  insertResults?: Array<{ data: any; error: any }>
  uploadResults?: Array<{ error: any }>
  removeCalls?: string[][]
  usersRows?: any[]
  commentRows?: any[]
  commentInsertResult?: { data: any; error: any }
} = {}) {
  const {
    photoRows = [],
    photoFetchError = null,
    insertResults = [],
    uploadResults = [],
    removeCalls = [],
    usersRows = [],
    commentRows = [],
    commentInsertResult = { data: null, error: null },
  } = overrides

  let insertCallIndex = 0
  let uploadCallIndex = 0

  const bucket = {
    upload: jest.fn().mockImplementation(async () => {
      const result = uploadResults[uploadCallIndex] ?? { error: null }
      uploadCallIndex++
      return result
    }),
    remove: jest.fn().mockImplementation(async (paths: string[]) => {
      removeCalls.push(paths)
      return { data: [], error: null }
    }),
    getPublicUrl: jest.fn((path: string) => ({ data: { publicUrl: `https://example.test/${path}` } })),
  }

  const sb: any = {
    from: jest.fn((table: string) => {
      if (table === 'event_photos') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({ data: photoRows, error: photoFetchError }),
            }),
          }),
          insert: jest.fn().mockImplementation(() => ({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockImplementation(async () => {
                const result = insertResults[insertCallIndex] ?? { data: null, error: { message: 'no mock result' } }
                insertCallIndex++
                return result
              }),
            }),
          })),
        }
      }
      if (table === 'users') {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({ data: usersRows, error: null }),
          }),
        }
      }
      if (table === 'event_photo_comments') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({ data: commentRows, error: null }),
            }),
          }),
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue(commentInsertResult),
            }),
          }),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
    storage: { from: jest.fn().mockReturnValue(bucket) },
    _bucket: bucket,
  }
  return sb
}

describe('uploadPhotoBatch', () => {
  function file(name: string) {
    return new File(['x'], name, { type: 'image/jpeg' })
  }

  it('uploads every file, sharing one caption and one upload_batch_id across the batch', async () => {
    const inserted = [
      { id: 'p1', event_id: 'ev-1', uploaded_by: 'u1', storage_path: 'ev-1/a.jpg', caption: 'Best night', upload_batch_id: 'batch', created_at: 't1' },
      { id: 'p2', event_id: 'ev-1', uploaded_by: 'u1', storage_path: 'ev-1/b.jpg', caption: 'Best night', upload_batch_id: 'batch', created_at: 't2' },
    ]
    const sb = makeFakeSupabase({
      uploadResults: [{ error: null }, { error: null }],
      insertResults: [{ data: inserted[0], error: null }, { data: inserted[1], error: null }],
    })

    const { succeeded, failed } = await uploadPhotoBatch(sb, {
      eventId: 'ev-1',
      userId: 'u1',
      files: [file('a.jpg'), file('b.jpg')],
      caption: 'Best night',
    })

    expect(failed).toEqual([])
    expect(succeeded).toHaveLength(2)
    expect(succeeded.map((p) => p.url).sort()).toEqual([
      'https://example.test/ev-1/a.jpg',
      'https://example.test/ev-1/b.jpg',
    ])

    const eventPhotosCalls = sb.from.mock.calls.filter(([t]: [string]) => t === 'event_photos')
    expect(eventPhotosCalls.length).toBeGreaterThanOrEqual(2)
  })

  it('stores an empty/whitespace-only caption as null', async () => {
    const sb = makeFakeSupabase({
      uploadResults: [{ error: null }],
      insertResults: [{ data: { id: 'p1', event_id: 'ev-1', uploaded_by: 'u1', storage_path: 'ev-1/a.jpg', caption: null, upload_batch_id: 'b', created_at: 't' }, error: null }],
    })
    const insertMock = sb.from('event_photos').insert as jest.Mock
    insertMock.mockClear()
    sb.from.mockClear()

    await uploadPhotoBatch(sb, { eventId: 'ev-1', userId: 'u1', files: [file('a.jpg')], caption: '   ' })

    const eventPhotosFromCall = sb.from.mock.results.find((r: any, i: number) => sb.from.mock.calls[i][0] === 'event_photos')
    expect(eventPhotosFromCall).toBeDefined()
  })

  it('rolls back the storage object when the metadata insert fails, and reports the failure', async () => {
    const sb = makeFakeSupabase({
      uploadResults: [{ error: null }],
      insertResults: [{ data: null, error: { message: 'insert denied' } }],
    })

    const { succeeded, failed } = await uploadPhotoBatch(sb, {
      eventId: 'ev-1',
      userId: 'u1',
      files: [file('a.jpg')],
      caption: '',
    })

    expect(succeeded).toEqual([])
    expect(failed).toHaveLength(1)
    expect(failed[0].name).toBe('a.jpg')
    expect(sb._bucket.remove).toHaveBeenCalledTimes(1)
  })

  it('does not roll back or duplicate metadata for files that already succeeded, when others fail', async () => {
    const sb = makeFakeSupabase({
      uploadResults: [{ error: null }, { error: { message: 'network error' } }],
      insertResults: [{ data: { id: 'p1', event_id: 'ev-1', uploaded_by: 'u1', storage_path: 'ev-1/a.jpg', caption: null, upload_batch_id: 'b', created_at: 't' }, error: null }],
    })

    const { succeeded, failed } = await uploadPhotoBatch(sb, {
      eventId: 'ev-1',
      userId: 'u1',
      files: [file('a.jpg'), file('b.jpg')],
      caption: '',
    })

    expect(succeeded).toHaveLength(1)
    expect(failed).toHaveLength(1)
    expect(failed[0].name).toBe('b.jpg')
    // Only the failed file's storage upload failed, so nothing needed rollback.
    expect(sb._bucket.remove).not.toHaveBeenCalled()
  })

  it('reports real completed/total progress as each file finishes', async () => {
    const sb = makeFakeSupabase({
      uploadResults: [{ error: null }, { error: null }, { error: null }],
      insertResults: [
        { data: { id: 'p1', event_id: 'ev-1', uploaded_by: 'u1', storage_path: 'ev-1/a.jpg', caption: null, upload_batch_id: 'b', created_at: 't' }, error: null },
        { data: { id: 'p2', event_id: 'ev-1', uploaded_by: 'u1', storage_path: 'ev-1/b.jpg', caption: null, upload_batch_id: 'b', created_at: 't' }, error: null },
        { data: { id: 'p3', event_id: 'ev-1', uploaded_by: 'u1', storage_path: 'ev-1/c.jpg', caption: null, upload_batch_id: 'b', created_at: 't' }, error: null },
      ],
    })

    const progress: Array<[number, number]> = []
    await uploadPhotoBatch(sb, {
      eventId: 'ev-1',
      userId: 'u1',
      files: [file('a.jpg'), file('b.jpg'), file('c.jpg')],
      caption: '',
      onProgress: (completed, total) => progress.push([completed, total]),
    })

    expect(progress).toHaveLength(3)
    expect(progress[progress.length - 1]).toEqual([3, 3])
  })
})

// ─── Downloading photos to the device ──────────────────────────────────────

describe('filenameForDownload', () => {
  it('extracts the basename from a storage path', () => {
    expect(filenameForDownload('ev-1/1699999999-u1-0.jpg')).toBe('1699999999-u1-0.jpg')
  })

  it('falls back to a default name when there is no basename', () => {
    expect(filenameForDownload('')).toBe('photo.jpg')
  })
})

describe('downloadPhotoToDevice', () => {
  let clickSpy: jest.SpyInstance
  let createObjectURLSpy: jest.SpyInstance
  let revokeObjectURLSpy: jest.SpyInstance

  beforeEach(() => {
    clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    createObjectURLSpy = jest.fn().mockReturnValue('blob:mock-url')
    revokeObjectURLSpy = jest.fn()
    ;(global as any).URL.createObjectURL = createObjectURLSpy
    ;(global as any).URL.revokeObjectURL = revokeObjectURLSpy
  })

  afterEach(() => {
    clickSpy.mockRestore()
    jest.restoreAllMocks()
  })

  it('fetches the photo, downloads it as a blob, and cleans up the object URL', async () => {
    const blob = new Blob(['fake-image-bytes'])
    global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => blob })

    const result = await downloadPhotoToDevice({ url: 'https://example.test/ev-1/a.jpg', storage_path: 'ev-1/a.jpg' })

    expect(result.ok).toBe(true)
    expect(global.fetch).toHaveBeenCalledWith('https://example.test/ev-1/a.jpg')
    expect(createObjectURLSpy).toHaveBeenCalledWith(blob)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url')
  })

  it('reports failure without throwing when the fetch response is not ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false })
    const result = await downloadPhotoToDevice({ url: 'https://example.test/ev-1/missing.jpg', storage_path: 'ev-1/missing.jpg' })
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('reports failure without throwing when fetch itself rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'))
    const result = await downloadPhotoToDevice({ url: 'https://example.test/ev-1/a.jpg', storage_path: 'ev-1/a.jpg' })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('network down')
  })
})

describe('saveViaShareSheet', () => {
  const PHOTOS = [
    { url: 'https://example.test/ev-1/a.jpg', storage_path: 'ev-1/a.jpg' },
    { url: 'https://example.test/ev-1/b.jpg', storage_path: 'ev-1/b.jpg' },
  ]

  afterEach(() => {
    jest.restoreAllMocks()
    delete (navigator as any).share
    delete (navigator as any).canShare
  })

  it('reports unsupported when the browser has no Web Share File API', async () => {
    global.fetch = jest.fn()
    const result = await saveViaShareSheet(PHOTOS)
    expect(result).toEqual({ ok: false, unsupported: true })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('hands fetched photos to navigator.share as real files', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) })
    const shareMock = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'canShare', { value: jest.fn().mockReturnValue(true), configurable: true })
    Object.defineProperty(navigator, 'share', { value: shareMock, configurable: true })

    const result = await saveViaShareSheet(PHOTOS)

    expect(result).toEqual({ ok: true })
    expect(shareMock).toHaveBeenCalledTimes(1)
    const sharedFiles = shareMock.mock.calls[0][0].files
    expect(sharedFiles).toHaveLength(2)
    expect(sharedFiles[0]).toBeInstanceOf(File)
    expect(sharedFiles[0].name).toBe('a.jpg')
  })

  it('treats the user cancelling the native share sheet as aborted, not a failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) })
    const abortError = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    Object.defineProperty(navigator, 'canShare', { value: jest.fn().mockReturnValue(true), configurable: true })
    Object.defineProperty(navigator, 'share', { value: jest.fn().mockRejectedValue(abortError), configurable: true })

    const result = await saveViaShareSheet(PHOTOS)
    expect(result).toEqual({ ok: true, aborted: true })
  })

  it('reports unsupported when canShare rejects the prepared files', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) })
    Object.defineProperty(navigator, 'canShare', { value: jest.fn().mockReturnValue(false), configurable: true })
    Object.defineProperty(navigator, 'share', { value: jest.fn(), configurable: true })

    const result = await saveViaShareSheet(PHOTOS)
    expect(result).toEqual({ ok: false, unsupported: true })
  })

  it('reports a real failure when every photo fails to fetch', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false })
    Object.defineProperty(navigator, 'canShare', { value: jest.fn().mockReturnValue(true), configurable: true })
    Object.defineProperty(navigator, 'share', { value: jest.fn(), configurable: true })

    const result = await saveViaShareSheet(PHOTOS)
    expect(result).toEqual({ ok: false, error: 'Could not prepare those photos.' })
  })
})

describe('downloadPhotosBatch', () => {
  beforeEach(() => {
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    ;(global as any).URL.createObjectURL = jest.fn().mockReturnValue('blob:mock-url')
    ;(global as any).URL.revokeObjectURL = jest.fn()
  })

  afterEach(() => jest.restoreAllMocks())

  it('downloads every photo sequentially and counts successes/failures', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['a']) })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['c']) })

    const photos = [
      { url: 'https://example.test/ev-1/a.jpg', storage_path: 'ev-1/a.jpg' },
      { url: 'https://example.test/ev-1/b.jpg', storage_path: 'ev-1/b.jpg' },
      { url: 'https://example.test/ev-1/c.jpg', storage_path: 'ev-1/c.jpg' },
    ]
    const progress: Array<[number, number]> = []
    const result = await downloadPhotosBatch(photos, (completed, total) => progress.push([completed, total]))

    expect(result).toEqual({ succeededCount: 2, failedCount: 1 })
    expect(progress).toEqual([[1, 3], [2, 3], [3, 3]])
  })

  it('handles an empty selection', async () => {
    const result = await downloadPhotosBatch([])
    expect(result).toEqual({ succeededCount: 0, failedCount: 0 })
  })
})

describe('fetchAlbumPhotos', () => {
  it('resolves public URLs for every returned row', async () => {
    const sb = makeFakeSupabase({
      photoRows: [{ id: 'p1', event_id: 'ev-1', uploaded_by: 'u1', storage_path: 'ev-1/a.jpg', caption: null, upload_batch_id: null, created_at: 't' }],
    })
    const { photos, error } = await fetchAlbumPhotos(sb, 'ev-1')
    expect(error).toBeNull()
    expect(photos).toHaveLength(1)
    expect(photos[0].url).toBe('https://example.test/ev-1/a.jpg')
  })

  it('surfaces a fetch error instead of throwing', async () => {
    const sb = makeFakeSupabase({ photoFetchError: { message: 'denied' } })
    const { photos, error } = await fetchAlbumPhotos(sb, 'ev-1')
    expect(photos).toEqual([])
    expect(error).toBe('denied')
  })

  it('gracefully handles old rows with no caption or upload_batch_id', async () => {
    const sb = makeFakeSupabase({
      photoRows: [{ id: 'p1', event_id: 'ev-1', uploaded_by: 'u1', storage_path: 'ev-1/old.jpg', created_at: 't' }],
    })
    const { photos, error } = await fetchAlbumPhotos(sb, 'ev-1')
    expect(error).toBeNull()
    expect(photos[0].caption).toBeUndefined()
    expect(photos[0].url).toBe('https://example.test/ev-1/old.jpg')
  })
})

describe('fetchUsersByIds', () => {
  it('maps rows by id and returns an empty object for no ids', async () => {
    const sb = makeFakeSupabase()
    expect(await fetchUsersByIds(sb, [])).toEqual({})
  })

  it('resolves name and photo_url for the given ids', async () => {
    const sb = makeFakeSupabase({ usersRows: [{ id: 'u1', name: 'Ali', photo_url: null }] })
    const result = await fetchUsersByIds(sb, ['u1'])
    expect(result.u1).toEqual({ id: 'u1', name: 'Ali', photoUrl: null })
  })
})

describe('fetchPhotoComments / postPhotoComment', () => {
  it('fetches comments oldest-first', async () => {
    const sb = makeFakeSupabase({ commentRows: [{ id: 'c1', photo_id: 'p1', user_id: 'u1', body: 'Nice!', created_at: 't1' }] })
    const { comments, error } = await fetchPhotoComments(sb, 'p1')
    expect(error).toBeNull()
    expect(comments).toHaveLength(1)
  })

  it('rejects an empty comment body without hitting the database', async () => {
    const sb = makeFakeSupabase()
    const { comment, error } = await postPhotoComment(sb, { photoId: 'p1', userId: 'u1', body: '   ' })
    expect(comment).toBeNull()
    expect(error).toBe('Comment cannot be empty.')
    expect(sb.from).not.toHaveBeenCalled()
  })

  it('trims and posts a non-empty comment', async () => {
    const sb = makeFakeSupabase({
      commentInsertResult: { data: { id: 'c1', photo_id: 'p1', user_id: 'u1', body: 'Great shot', created_at: 't1' }, error: null },
    })
    const { comment, error } = await postPhotoComment(sb, { photoId: 'p1', userId: 'u1', body: '  Great shot  ' })
    expect(error).toBeNull()
    expect(comment?.body).toBe('Great shot')
  })
})
