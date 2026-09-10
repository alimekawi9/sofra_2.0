import {
  fetchDressCodePhotos,
  uploadDressCodePhotos,
  deleteDressCodePhoto,
  MAX_DRESS_CODE_PHOTOS,
} from '@/lib/event-dress-code-photos'

function makeFakeSupabase(overrides: {
  photoRows?: unknown[]
  photoFetchError?: { message: string } | null
  insertResults?: Array<{ data: unknown; error: { message: string } | null }>
  uploadResults?: Array<{ error: { message: string } | null }>
  deleteResults?: Array<{ error: { message: string } | null }>
  removeCalls?: string[][]
  insertCalls?: unknown[]
} = {}) {
  const {
    photoRows = [],
    photoFetchError = null,
    insertResults = [],
    uploadResults = [],
    deleteResults = [],
    removeCalls = [],
    insertCalls = [],
  } = overrides

  let insertCallIndex = 0
  let uploadCallIndex = 0
  let deleteCallIndex = 0

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
      if (table === 'event_dress_code_photos') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              order: jest.fn().mockResolvedValue({ data: photoRows, error: photoFetchError }),
            }),
          }),
          insert: jest.fn().mockImplementation((payload: unknown) => {
            insertCalls.push(payload)
            return {
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockImplementation(async () => {
                  const result = insertResults[insertCallIndex] ?? { data: null, error: { message: 'no mock result' } }
                  insertCallIndex++
                  return result
                }),
              }),
            }
          }),
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockImplementation(async () => {
              const result = deleteResults[deleteCallIndex] ?? { error: null }
              deleteCallIndex++
              return result
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

function file(name: string) {
  return new File(['x'], name, { type: 'image/jpeg' })
}

it('exposes the max as 6', () => {
  expect(MAX_DRESS_CODE_PHOTOS).toBe(6)
})

describe('fetchDressCodePhotos', () => {
  it('maps stored rows to public URLs, ordered by sort_order', async () => {
    const sb = makeFakeSupabase({
      photoRows: [
        { id: 'p1', event_id: 'ev-1', storage_path: 'dress-code/ev-1/a.jpg', sort_order: 0, created_at: 't1' },
        { id: 'p2', event_id: 'ev-1', storage_path: 'dress-code/ev-1/b.jpg', sort_order: 1, created_at: 't2' },
      ],
    })
    const { photos, error } = await fetchDressCodePhotos(sb, 'ev-1')
    expect(error).toBeNull()
    expect(photos.map((p) => p.url)).toEqual([
      'https://example.test/dress-code/ev-1/a.jpg',
      'https://example.test/dress-code/ev-1/b.jpg',
    ])
  })

  it('reports a fetch error', async () => {
    const sb = makeFakeSupabase({ photoFetchError: { message: 'db down' } })
    const { photos, error } = await fetchDressCodePhotos(sb, 'ev-1')
    expect(photos).toEqual([])
    expect(error).toBe('db down')
  })
})

describe('uploadDressCodePhotos', () => {
  it('uploads every file under a dress-code path prefix and assigns increasing sort_order', async () => {
    const inserted = [
      { id: 'p1', event_id: 'ev-1', storage_path: 'dress-code/ev-1/a.jpg', sort_order: 3, created_at: 't1' },
      { id: 'p2', event_id: 'ev-1', storage_path: 'dress-code/ev-1/b.jpg', sort_order: 4, created_at: 't2' },
    ]
    const insertCalls: unknown[] = []
    const sb = makeFakeSupabase({
      uploadResults: [{ error: null }, { error: null }],
      insertResults: [{ data: inserted[0], error: null }, { data: inserted[1], error: null }],
      insertCalls,
    })

    const { succeeded, failed } = await uploadDressCodePhotos(sb, {
      eventId: 'ev-1',
      files: [file('a.jpg'), file('b.jpg')],
      startingSortOrder: 3,
    })

    expect(failed).toEqual([])
    expect(succeeded).toHaveLength(2)
    expect(insertCalls.map((c: any) => c.sort_order).sort()).toEqual([3, 4])
    expect(insertCalls[0]).toEqual(expect.objectContaining({ event_id: 'ev-1' }))
  })

  it('rolls back the storage object when the metadata insert fails', async () => {
    const sb = makeFakeSupabase({
      uploadResults: [{ error: null }],
      insertResults: [{ data: null, error: { message: 'insert denied' } }],
    })

    const { succeeded, failed } = await uploadDressCodePhotos(sb, {
      eventId: 'ev-1',
      files: [file('a.jpg')],
      startingSortOrder: 0,
    })

    expect(succeeded).toEqual([])
    expect(failed).toHaveLength(1)
    expect(sb._bucket.remove).toHaveBeenCalledTimes(1)
  })

  it('reports a failed upload without rolling back files that already succeeded', async () => {
    const sb = makeFakeSupabase({
      uploadResults: [{ error: null }, { error: { message: 'network error' } }],
      insertResults: [{ data: { id: 'p1', event_id: 'ev-1', storage_path: 'dress-code/ev-1/a.jpg', sort_order: 0, created_at: 't' }, error: null }],
    })

    const { succeeded, failed } = await uploadDressCodePhotos(sb, {
      eventId: 'ev-1',
      files: [file('a.jpg'), file('b.jpg')],
      startingSortOrder: 0,
    })

    expect(succeeded).toHaveLength(1)
    expect(failed).toHaveLength(1)
    expect(failed[0].name).toBe('b.jpg')
    expect(sb._bucket.remove).not.toHaveBeenCalled()
  })
})

describe('deleteDressCodePhoto', () => {
  it('removes the storage object then deletes the row', async () => {
    const sb = makeFakeSupabase({ deleteResults: [{ error: null }] })
    const result = await deleteDressCodePhoto(sb, { id: 'p1', storage_path: 'dress-code/ev-1/a.jpg' })
    expect(result.ok).toBe(true)
    expect(sb._bucket.remove).toHaveBeenCalledWith(['dress-code/ev-1/a.jpg'])
  })

  it('reports failure when the row delete errors', async () => {
    const sb = makeFakeSupabase({ deleteResults: [{ error: { message: 'db error' } }] })
    const result = await deleteDressCodePhoto(sb, { id: 'p1', storage_path: 'dress-code/ev-1/a.jpg' })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('db error')
  })
})
