'use client'

export type SaveProgressState =
  | { status: 'saving'; completed: number; total: number }
  | { status: 'done'; succeededCount: number; failedCount: number; total: number }

export interface PhotoSaveProgressProps {
  state: SaveProgressState | null
  onDismiss: () => void
}

export function PhotoSaveProgress({ state, onDismiss }: PhotoSaveProgressProps) {
  if (!state) return null

  const percent =
    state.status === 'saving'
      ? Math.round((state.completed / state.total) * 100)
      : 100

  return (
    <div className="sv2-upload-progress" role="status" aria-live="polite">
      <div className="sv2-upload-progress-head">
        <span>
          {state.status === 'saving' && 'Saving photos'}
          {state.status === 'done' && state.failedCount === 0 &&
            `${state.succeededCount} ${state.succeededCount === 1 ? 'photo' : 'photos'} saved`}
          {state.status === 'done' && state.failedCount > 0 && `${state.succeededCount} of ${state.total} saved`}
        </span>
        {state.status === 'done' && (
          <button type="button" aria-label="Dismiss" onClick={onDismiss}>✕</button>
        )}
      </div>

      {state.status === 'saving' && (
        <>
          <p>{state.completed} of {state.total}</p>
          <div className="sv2-upload-progress-bar">
            <span style={{ width: `${percent}%` }} />
          </div>
        </>
      )}

      {state.status === 'done' && state.failedCount > 0 && (
        <p>{state.failedCount} couldn&rsquo;t be saved</p>
      )}
    </div>
  )
}
