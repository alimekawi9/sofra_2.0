'use client'

export type UploadProgressState =
  | { status: 'uploading'; completed: number; total: number }
  | { status: 'success'; total: number }
  | { status: 'partial'; succeeded: number; total: number; failedNames: string[] }
  | { status: 'error'; message: string }

export interface PhotoUploadProgressProps {
  state: UploadProgressState | null
  onDismiss: () => void
}

export function PhotoUploadProgress({ state, onDismiss }: PhotoUploadProgressProps) {
  if (!state) return null

  const percent =
    state.status === 'uploading'
      ? Math.round((state.completed / state.total) * 100)
      : state.status === 'partial'
        ? Math.round((state.succeeded / state.total) * 100)
        : 100

  return (
    <div className="sv2-upload-progress" role="status" aria-live="polite">
      <div className="sv2-upload-progress-head">
        <span>
          {state.status === 'uploading' && 'Uploading photos'}
          {state.status === 'success' && `${state.total} ${state.total === 1 ? 'photo' : 'photos'} uploaded`}
          {state.status === 'partial' && `${state.succeeded} of ${state.total} uploaded`}
          {state.status === 'error' && 'Upload failed'}
        </span>
        {state.status !== 'uploading' && (
          <button type="button" aria-label="Dismiss" onClick={onDismiss}>✕</button>
        )}
      </div>

      {state.status === 'uploading' && (
        <>
          <p>{state.completed} of {state.total}</p>
          <div className="sv2-upload-progress-bar">
            <span style={{ width: `${percent}%` }} />
          </div>
        </>
      )}

      {state.status === 'partial' && (
        <p>{state.total - state.succeeded} couldn&rsquo;t be uploaded</p>
      )}

      {state.status === 'error' && <p>{state.message}</p>}
    </div>
  )
}
