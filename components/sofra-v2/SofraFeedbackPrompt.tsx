'use client'

import { useState } from 'react'

export function SofraFeedbackPrompt({ submitted, onSubmit }: {
  submitted: boolean
  onSubmit: (rating: number, ease: number, comment: string) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(5)
  const [ease, setEase] = useState(5)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  if (submitted) return null

  async function save() {
    setSaving(true)
    const ok = await onSubmit(rating, ease, comment)
    setSaving(false)
    if (ok) setOpen(false)
  }

  return <>
    <aside className="sv2-feedback-prompt">
      <div><strong>UNLOCK THE SHARED ALBUM</strong><p>Complete Sofra&rsquo;s short, private survey before viewing or adding photos.</p></div>
      <button type="button" onClick={() => setOpen(true)}>TAKE THE SURVEY</button>
    </aside>
    {open && <div className="sv2-prep-dialog-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <section className="sv2-prep-dialog" role="dialog" aria-modal="true" aria-labelledby="guest-sofra-feedback-heading" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="guest-sofra-feedback-heading">Help Sofra get better</h2>
        <label>Overall experience<select value={rating} onChange={(event) => setRating(Number(event.target.value))}>{[5,4,3,2,1].map((value) => <option key={value} value={value}>{value} / 5</option>)}</select></label>
        <label>How easy was participating?<select value={ease} onChange={(event) => setEase(Number(event.target.value))}>{[5,4,3,2,1].map((value) => <option key={value} value={value}>{value} / 5</option>)}</select></label>
        <label>Anything we should improve?<textarea value={comment} maxLength={2000} rows={4} onChange={(event) => setComment(event.target.value)} /></label>
        <small>Your response is private to Sofra and is not shown to the host or other guests.</small>
        <div><button type="button" onClick={() => setOpen(false)}>CANCEL</button><button type="button" disabled={saving} onClick={() => void save()}>{saving ? 'SENDING…' : 'SEND FEEDBACK'}</button></div>
      </section>
    </div>}
  </>
}
