'use client'

import { useState } from 'react'

export function SofraFeedbackPrompt({ submitted, onSubmit }: {
  submitted: boolean
  onSubmit: (dietaryNeedsMissed: boolean) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [answer, setAnswer] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  if (submitted) return null

  async function save() {
    if (answer === null) return
    setSaving(true)
    const ok = await onSubmit(answer)
    setSaving(false)
    if (ok) setOpen(false)
  }

  return <>
    <aside className="sv2-feedback-prompt">
      <div><strong>UNLOCK THE SHARED ALBUM</strong><p>Answer one private question before viewing or adding photos.</p></div>
      <button type="button" onClick={() => setOpen(true)}>ANSWER TO CONTINUE</button>
    </aside>
    {open && <div className="sv2-prep-dialog-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <section className="sv2-prep-dialog" role="dialog" aria-modal="true" aria-labelledby="guest-sofra-feedback-heading" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="guest-sofra-feedback-heading">One quick question</h2>
        <fieldset className="sv2-feedback-dietary-question">
          <legend>Did anything you told us about your diet or allergies get missed?</legend>
          <div>
            <button type="button" aria-pressed={answer === true} onClick={() => setAnswer(true)}>YES</button>
            <button type="button" aria-pressed={answer === false} onClick={() => setAnswer(false)}>NO</button>
          </div>
        </fieldset>
        <small>Your response is private to Sofra and is not shown to the host or other guests.</small>
        <div><button type="button" onClick={() => setOpen(false)}>CANCEL</button><button type="button" disabled={saving || answer === null} onClick={() => void save()}>{saving ? 'SENDING…' : 'CONTINUE TO PHOTOS'}</button></div>
      </section>
    </div>}
  </>
}
