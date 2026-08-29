'use client'

import { useState } from 'react'
import type { EventPrepItem, EventPrepKey, EventPrepPeriod } from '@/lib/event-prep'

const PERIOD_LABELS: Record<EventPrepPeriod, string> = {
  weeks: 'Weeks out', one_two_weeks: '1–2 weeks out', day_of: 'Day of', after: 'After',
}

const MANUAL_KEYS = new Set<EventPrepItem['key']>([
  'theme_concept', 'date_invites', 'signature_drink', 'decor', 'cameras', 'audio',
  'dietary_review', 'seating_finalized', 'photos_reminder',
])

export function EventPrepChecklist({
  items, isPast, savingKey, error, onSaveItem, onAction, onSubmitFeedback,
}: {
  items: EventPrepItem[]
  isPast: boolean
  savingKey: EventPrepKey | null
  error: string
  onSaveItem: (key: EventPrepKey, completed: boolean, note?: string) => Promise<boolean>
  onAction: (action: EventPrepItem['action']) => void
  onSubmitFeedback: (rating: number, ease: number, comment: string) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<EventPrepKey | null>(null)
  const [note, setNote] = useState('')
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [rating, setRating] = useState(5)
  const [ease, setEase] = useState(5)
  const [comment, setComment] = useState('')
  const [feedbackSaving, setFeedbackSaving] = useState(false)
  const visible = items.filter((item) => item.period !== 'after' || isPast)
  const completed = visible.filter((item) => item.completed).length
  const attention = visible.filter((item) => item.alerting).length
  const postEventAttention = visible.some((item) => item.period === 'after' && item.alerting)

  async function saveFeedback() {
    setFeedbackSaving(true)
    const ok = await onSubmitFeedback(rating, ease, comment)
    setFeedbackSaving(false)
    if (ok) setFeedbackOpen(false)
  }

  function activate(item: EventPrepItem) {
    if (item.action === 'inline') {
      setEditingKey(item.key as EventPrepKey)
      setNote(item.note)
      return
    }
    if (item.action === 'feedback') {
      setFeedbackOpen(true)
      return
    }
    onAction(item.action)
  }

  return (
    <>
      {attention > 0 && (
        <aside className="sv2-prep-attention" aria-label="Event preparation needs attention">
          <div><strong>{attention} {attention === 1 ? 'ITEM NEEDS' : 'ITEMS NEED'} ATTENTION</strong><p>{postEventAttention ? 'Your private Sofra feedback is still waiting.' : 'Required event prep is due soon.'}</p></div>
          <button type="button" onClick={() => setOpen(true)}>REVIEW</button>
        </aside>
      )}
      <section className="sv2-event-prep-disclosure">
        <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <span className="sv2-host-details-icon sv2-event-prep-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M9 5h10a1 1 0 0 1 1 1v14H5V6a1 1 0 0 1 1-1h2M9 3h6v4H9zM8 11l1.5 1.5L12 10M14 11h3M8 16l1.5 1.5L12 15M14 16h3" />
            </svg>
          </span>
          <span className="sv2-event-prep-copy">
            <span><strong>EVENT PREP</strong>{attention > 0 && <b>{attention} DUE</b>}</span>
            <small>{completed} of {visible.length} complete</small>
          </span>
          <span className="sv2-disclosure-line" aria-hidden="true" />
        </button>
        {open && (
          <div className="sv2-event-prep-expanded">
            {(['weeks', 'one_two_weeks', 'day_of', 'after'] as EventPrepPeriod[]).map((period) => {
              const periodItems = visible.filter((item) => item.period === period)
              if (periodItems.length === 0) return null
              return <div className="sv2-event-prep-period" key={period}>
                <h3>{PERIOD_LABELS[period]}</h3>
                {periodItems.map((item) => {
                  const isManual = MANUAL_KEYS.has(item.key)
                  return <article className={item.alerting ? 'is-alerting' : ''} key={item.key}>
                    {isManual ? (
                      <button className="sv2-prep-check" type="button" disabled={savingKey === item.key}
                        aria-label={`${item.completed ? 'Mark incomplete' : 'Mark complete'}: ${item.label}`}
                        onClick={() => void onSaveItem(item.key as EventPrepKey, !item.completed, item.note)}>
                        {item.completed ? '✓' : ''}
                      </button>
                    ) : <span className={`sv2-prep-check${item.completed ? ' is-complete' : ''}`} aria-hidden="true">{item.completed ? '✓' : ''}</span>}
                    <button className="sv2-prep-item-action" type="button" onClick={() => activate(item)}>
                      <span><strong>{item.label}</strong><small>{item.required ? 'Required' : 'Optional'}{item.alerting ? item.period === 'after' ? ' · Follow up' : ' · Due soon' : ''}</small></span>
                      <span aria-hidden="true">›</span>
                    </button>
                    {item.key === 'photos_reminder' && <button className="sv2-prep-reminder" type="button" onClick={() => onAction('photo-reminder')}>SEND REMINDER</button>}
                  </article>
                })}
              </div>
            })}
            {error && <p className="sv2-prep-error" role="alert">{error}</p>}
          </div>
        )}
      </section>

      {editingKey && (
        <div className="sv2-prep-dialog-backdrop" role="presentation" onMouseDown={() => setEditingKey(null)}>
          <section className="sv2-prep-dialog" role="dialog" aria-modal="true" aria-labelledby="prep-note-heading" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="prep-note-heading">{items.find((item) => item.key === editingKey)?.label}</h2>
            <p>Add an optional note, then mark this item complete.</p>
            <textarea value={note} maxLength={500} rows={4} onChange={(event) => setNote(event.target.value)} placeholder="Optional planning note" />
            <div><button type="button" onClick={() => setEditingKey(null)}>CANCEL</button><button type="button" disabled={savingKey === editingKey} onClick={async () => { if (await onSaveItem(editingKey, true, note)) setEditingKey(null) }}>MARK COMPLETE</button></div>
          </section>
        </div>
      )}

      {feedbackOpen && (
        <div className="sv2-prep-dialog-backdrop" role="presentation" onMouseDown={() => setFeedbackOpen(false)}>
          <section className="sv2-prep-dialog" role="dialog" aria-modal="true" aria-labelledby="sofra-feedback-heading" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="sofra-feedback-heading">Help Sofra get better</h2>
            <label>Overall experience<select value={rating} onChange={(event) => setRating(Number(event.target.value))}>{[5,4,3,2,1].map((value) => <option key={value} value={value}>{value} / 5</option>)}</select></label>
            <label>How easy was planning?<select value={ease} onChange={(event) => setEase(Number(event.target.value))}>{[5,4,3,2,1].map((value) => <option key={value} value={value}>{value} / 5</option>)}</select></label>
            <label>Anything we should improve?<textarea value={comment} maxLength={2000} rows={4} onChange={(event) => setComment(event.target.value)} /></label>
            <small>Your response is private to Sofra and is not shown to guests or co-hosts.</small>
            <div><button type="button" onClick={() => setFeedbackOpen(false)}>CANCEL</button><button type="button" disabled={feedbackSaving} onClick={() => void saveFeedback()}>{feedbackSaving ? 'SENDING…' : 'SEND FEEDBACK'}</button></div>
          </section>
        </div>
      )}
    </>
  )
}
