'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isEventManager } from '@/lib/event-access'
import {
  addClockMinutes,
  defaultEventTimeline,
  fetchEventTimeline,
  formatTimelineClock,
  saveEventTimeline,
  sortEventTimeline,
  type EventTimelineItem,
} from '@/lib/event-timeline'
import { formatEventDate, formatEventTime, isEventDateUndecided } from '@/lib/event-date'
import '@/components/sofra-v2/sofra-v2.css'

type TimelineEvent = { host_id: string; title: string; event_date: string }

export default function EventTimelinePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const supabase = createClient()
  const started = useRef(false)
  const [managerId, setManagerId] = useState('')
  const [event, setEvent] = useState<TimelineEvent | null>(null)
  const [items, setItems] = useState<EventTimelineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const orderedItems = useMemo(() => sortEventTimeline(items), [items])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const stored = localStorage.getItem('sofra_user_id')
      if (!stored) { router.replace('/login?next=' + encodeURIComponent(`/events/${params.id}/timeline`)); return }
      const { data: eventRow, error: eventError } = await supabase.from('events')
        .select('host_id,title,event_date').eq('id', params.id).maybeSingle()
      if (eventError || !eventRow) throw eventError ?? new Error('Event not found')
      if (!(await isEventManager(supabase, params.id, stored, eventRow.host_id))) {
        router.replace(`/events/${params.id}`)
        return
      }
      const typedEvent = eventRow as TimelineEvent
      const timeline = await fetchEventTimeline(supabase, params.id, stored)
      if (timeline.error) throw new Error(timeline.error)
      setManagerId(stored)
      setEvent(typedEvent)
      setItems(timeline.items.length > 0 ? timeline.items : defaultEventTimeline(typedEvent.event_date))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Couldn't load the timing schedule. Try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    void load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function changeItem(id: string, change: Partial<Pick<EventTimelineItem, 'title' | 'time'>>) {
    setSaved(false)
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...change } : item))
  }

  function addItem() {
    const latest = orderedItems.at(-1)?.time ?? (event ? defaultEventTimeline(event.event_date)[0].time : '18:00')
    setItems((current) => [...current, {
      id: `new-${Date.now()}-${current.length}`,
      title: 'New moment',
      time: addClockMinutes(latest, 30),
      position: current.length,
    }])
    setSaved(false)
  }

  function removeItem(id: string) {
    if (items.length <= 1) return
    setItems((current) => current.filter((item) => item.id !== id))
    setSaved(false)
  }

  async function save() {
    if (!managerId || items.some((item) => !item.title.trim() || !/^\d{2}:\d{2}$/.test(item.time))) {
      setError('Every moment needs a name and time.')
      return
    }
    setSaving(true)
    setError('')
    const result = await saveEventTimeline(supabase, params.id, managerId, items)
    setSaving(false)
    if (!result.ok) {
      setError(result.error ?? "Couldn't save the timing schedule.")
      return
    }
    setItems(sortEventTimeline(items))
    setSaved(true)
  }

  return <div className="sv2-root sv2-device-page sv2-app-page sv2-timeline-page">
    <main className="sv2-device-shell sv2-app-shell sv2-timeline-shell">
      <Link className="sv2-back-link" href={`/events/${params.id}`}>← Event details</Link>
      <header className="sv2-timeline-header">
        <p>SOFRA · EVENT PREP</p>
        <h1>Timing Schedule</h1>
        {event && <span>{event.title}{!isEventDateUndecided(event.event_date) ? ` · ${formatEventDate(event.event_date, { weekday: 'long', month: 'long', day: 'numeric' })} · starts ${formatEventTime(event.event_date)}` : ' · start time undecided'}</span>}
      </header>

      {loading ? <p className="sv2-timeline-state">Setting the timeline…</p> : error && !event ? (
        <div className="sv2-timeline-state"><p>{error}</p><button type="button" onClick={() => void load()}>RETRY</button></div>
      ) : <>
        <p className="sv2-timeline-intro">Start with the event time, then shape the evening around the moments that matter. Everything stays editable.</p>
        <section className="sv2-timeline-editor" aria-label="Event timing schedule">
          {orderedItems.map((item, index) => <article key={item.id} className="sv2-timeline-row">
            <div className="sv2-timeline-time">
              <input aria-label={`Time for ${item.title}`} type="time" value={item.time} onChange={(e) => changeItem(item.id, { time: e.target.value })} />
              <span>{formatTimelineClock(item.time)}</span>
            </div>
            <span className="sv2-timeline-node" aria-hidden="true" />
            <div className="sv2-timeline-card">
              <label><span>{index === 0 ? 'Opening moment' : `Moment ${index + 1}`}</span><input aria-label={`Name for moment ${index + 1}`} value={item.title} maxLength={120} onChange={(e) => changeItem(item.id, { title: e.target.value })} /></label>
              <button type="button" disabled={items.length <= 1} aria-label={`Remove ${item.title}`} onClick={() => removeItem(item.id)}>REMOVE</button>
            </div>
          </article>)}
        </section>
        <div className="sv2-timeline-actions">
          <button type="button" className="sv2-timeline-add" disabled={items.length >= 30} onClick={addItem}>+ ADD ANOTHER MOMENT</button>
          <button type="button" className="sv2-timeline-save" disabled={saving} onClick={() => void save()}>{saving ? 'SAVING…' : 'SAVE SCHEDULE'}</button>
        </div>
        {error && <p className="sv2-timeline-error" role="alert">{error}</p>}
        {saved && <p className="sv2-timeline-saved" role="status">Schedule saved.</p>}
      </>}
    </main>
  </div>
}
