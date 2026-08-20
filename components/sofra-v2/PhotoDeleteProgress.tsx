'use client'

export type DeleteProgressState =
  | { status: 'deleting'; completed: number; total: number }
  | { status: 'done'; succeededCount: number; failedCount: number; total: number }

export interface PhotoDeleteProgressProps {
  state: DeleteProgressState | null
  onDismiss: () => void
}

export function PhotoDeleteProgress({ state, onDismiss }: PhotoDeleteProgressProps) {
  if (!state) return null

  const percent =
    state.status === 'deleting'
      ? Math.round((state.completed / state.total) * 100)
      : 100

  return (
    <div className="sv2-upload-progress" role="status" aria-live="polite">
      <div className="sv2-upload-progress-head">
        <span>
          {state.status === 'deleting' && 'Deleting photos'}
          {state.status === 'done' && state.failedCount === 0 &&
            `${state.succeededCount} ${state.succeededCount === 1 ? 'photo' : 'photos'} deleted`}
          {state.status === 'done' && state.failedCount > 0 && `${state.succeededCount} of ${state.total} deleted`}
        </span>
        {state.status === 'done' && (
          <button type="button" aria-label="Dismiss" onClick={onDismiss}>✕</button>
        )}
      </div>

      {state.status === 'deleting' && (
        <>
          <p>{state.completed} of {state.total}</p>
          <div className="sv2-upload-progress-bar">
            <span style={{ width: `${percent}%` }} />
          </div>
        </>
      )}

      {state.status === 'done' && state.failedCount > 0 && (
        <p>{state.failedCount} couldn&rsquo;t be deleted — you can only delete your own photos.</p>
      )}
    </div>
  )
}
