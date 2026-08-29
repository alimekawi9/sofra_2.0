'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { createClient } from '@/lib/supabase/client'
import { isEventManager } from '@/lib/event-access'
import { fetchEventAttendees, type SeatingAttendee } from '@/lib/event-attendees'
import {
  createSeatPositions,
  inferSeatingSpread,
  recommendSeating,
  seatingExportOrder,
  swapSeatAssignments,
  type SeatAssignment,
  type SeatPosition,
  type SeatingSignal,
  type SeatingSpread,
} from '@/lib/seating'
import {
  fetchSavedSeatingLayout,
  fetchSeatingSignals,
  saveSeatingLayout,
  setHostSeatingParticipation,
} from '@/lib/seating-data'
import { AlbumAvatar } from '@/components/sofra-v2/AlbumAvatar'
import { PrintPreviewActions } from '@/components/sofra-v2/PrintPreviewActions'
import { formatEventDate } from '@/lib/event-date'
import '@/components/sofra-v2/sofra-v2.css'

type EventRow = { host_id: string; title: string; event_date: string }

const SEATING_LOAD_RETRY_DELAYS = [250, 700]

function isTransientSeatingLoadError(error: unknown) {
  const candidate = error as { code?: unknown; status?: unknown; message?: unknown } | null
  const code = typeof candidate?.code === 'string' ? candidate.code : ''
  const status = Number(candidate?.status)
  const message = typeof candidate?.message === 'string' ? candidate.message.toLowerCase() : ''
  return code === 'PGRST202'
    || code.startsWith('08')
    || status >= 500
    || message.includes('schema cache')
    || message.includes('failed to fetch')
    || message.includes('network')
    || message.includes('timeout')
    || message.includes('attendee list changed')
    || message.includes('another host changed')
}

function waitForRetry(delay: number) {
  return new Promise((resolve) => window.setTimeout(resolve, delay))
}

function SeatCard({
  seat,
  attendee,
  selected,
  onSelect,
}: {
  seat: SeatPosition
  attendee: SeatingAttendee
  selected: boolean
  onSelect: () => void
}) {
  const draggable = useDraggable({ id: seat.id })
  const droppable = useDroppable({ id: seat.id })
  const transform = draggable.transform
    ? `translate3d(${draggable.transform.x}px,${draggable.transform.y}px,0)`
    : undefined
  return (
    <button
      ref={(node) => { draggable.setNodeRef(node); droppable.setNodeRef(node) }}
      type="button"
      className={`sv2-seating-seat${attendee.rsvpStatus === 'maybe' ? ' is-maybe' : ''}${selected ? ' is-selected' : ''}${droppable.isOver ? ' is-over' : ''}`}
      style={{ transform }}
      onClick={onSelect}
      {...draggable.listeners}
      {...draggable.attributes}
      aria-label={`${attendee.name}, ${attendee.rsvpStatus === 'maybe' ? 'maybe attending' : 'attending'}, ${seat.side} seat ${seat.index + 1}`}
    >
      <AlbumAvatar name={attendee.name} photoUrl={attendee.photoUrl ?? null} />
      <span>{attendee.name}</span>
      {attendee.isHost && <small>HOST</small>}
      {attendee.rsvpStatus === 'maybe' && <small className="sv2-seating-maybe">MAYBE</small>}
    </button>
  )
}

function EmptySeat({ seat, onSelect }: { seat: SeatPosition; onSelect: () => void }) {
  const droppable = useDroppable({ id: seat.id })
  return (
    <button
      ref={droppable.setNodeRef}
      type="button"
      className={`sv2-seating-seat sv2-seating-seat-empty${droppable.isOver ? ' is-over' : ''}`}
      onClick={onSelect}
      aria-label={`Open ${seat.side === 'head' ? `head ${seat.index + 1}` : `${seat.side} position ${seat.index + 1}`}`}
    >
      <span aria-hidden="true">+</span>
      <small>OPEN SEAT</small>
    </button>
  )
}

function RenderedTable({
  attendees,
  seats,
  assignments,
  selectedSeatId,
  showOpenSeats,
  onSeatSelect,
}: {
  attendees: SeatingAttendee[]
  seats: SeatPosition[]
  assignments: SeatAssignment[]
  selectedSeatId: string | null
  showOpenSeats: boolean
  onSeatSelect: (seatId: string) => void
}) {
  const attendeeById = new Map(attendees.map((attendee) => [attendee.userId, attendee]))
  const assignmentBySeat = new Map(assignments.map((assignment) => [assignment.seatId, assignment]))
  const seatCard = (seat: SeatPosition) => {
    const assignment = assignmentBySeat.get(seat.id)
    const attendee = assignment ? attendeeById.get(assignment.userId) : null
    if (!attendee) return <EmptySeat key={seat.id} seat={seat} onSelect={() => onSeatSelect(seat.id)} />
    return <SeatCard key={seat.id} seat={seat} attendee={attendee} selected={selectedSeatId === seat.id} onSelect={() => onSeatSelect(seat.id)} />
  }
  const north = seats.filter((seat) => seat.side === 'north').sort((a, b) => a.index - b.index)
  const south = seats.filter((seat) => seat.side === 'south').sort((a, b) => a.index - b.index)
  const heads = seats.filter((seat) => seat.side === 'head').sort((a, b) => a.index - b.index)
  const isLarge = assignments.length > 8
  return (
    <div className={`sv2-seating-stage${isLarge ? ' is-large' : ''}${showOpenSeats ? ' is-arranging' : ''}`}>
      <div className="sv2-seating-head sv2-seating-head-start">{heads[0] && seatCard(heads[0])}</div>
      <div className="sv2-seating-side sv2-seating-north">{north.map(seatCard)}</div>
      <div className="sv2-seating-tabletop" aria-hidden="true" />
      <div className="sv2-seating-side sv2-seating-south">{south.map(seatCard)}</div>
      <div className="sv2-seating-head sv2-seating-head-end">{heads[1] && seatCard(heads[1])}</div>
    </div>
  )
}

export default function SeatingPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const supabase = createClient()
  const initialLoadStarted = useRef(false)
  const [managerId, setManagerId] = useState('')
  const [event, setEvent] = useState<EventRow | null>(null)
  const [attendees, setAttendees] = useState<SeatingAttendee[]>([])
  const [signals, setSignals] = useState<SeatingSignal[]>([])
  const [assignments, setAssignments] = useState<SeatAssignment[]>([])
  const [version, setVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null)
  const [spread, setSpread] = useState<SeatingSpread | 'custom'>('centered')
  const [dragging, setDragging] = useState(false)
  const [printOptionsOpen, setPrintOptionsOpen] = useState(false)
  const [printPreview, setPrintPreview] = useState(false)
  const [includeServiceNotes, setIncludeServiceNotes] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  )
  const seats = useMemo(() => createSeatPositions(attendees.length), [attendees.length])
  const attendeeById = useMemo(() => new Map(attendees.map((attendee) => [attendee.userId, attendee])), [attendees])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      for (let attempt = 0; ; attempt += 1) {
        try {
          const stored = localStorage.getItem('sofra_user_id')
          if (!stored) { router.push('/login?next=' + encodeURIComponent(`/events/${params.id}/seating`)); return }
          setManagerId(stored)
          const { data: eventRow, error: eventError } = await supabase
            .from('events').select('host_id,title,event_date').eq('id', params.id).maybeSingle()
          if (eventError || !eventRow) throw eventError ?? new Error('Event not found')
          if (!(await isEventManager(supabase, params.id, stored, eventRow.host_id))) {
            router.replace(`/events/${params.id}`)
            return
          }
          const typedEvent = eventRow as EventRow
          setEvent(typedEvent)
          const [loadedAttendees, loadedSignals, saved] = await Promise.all([
            fetchEventAttendees(supabase, params.id, typedEvent.host_id, stored),
            fetchSeatingSignals(supabase, params.id, stored),
            fetchSavedSeatingLayout(supabase, params.id, stored),
          ])
          setAttendees(loadedAttendees)
          setSignals(loadedSignals)
          const recommended = recommendSeating(loadedAttendees, loadedSignals, 'centered')
          const currentIds = new Set(loadedAttendees.map((attendee) => attendee.userId))
          const savedIsCurrent = saved
            && saved.assignments.length === loadedAttendees.length
            && saved.assignments.every((assignment) => currentIds.has(assignment.userId))
          const nextAssignments = savedIsCurrent ? saved.assignments : recommended.assignments
          setSpread(savedIsCurrent
            ? inferSeatingSpread(saved.assignments, recommended.seats, loadedAttendees.length)
            : 'centered')
          setAssignments(nextAssignments)
          setVersion(saved?.version ?? 0)
          if (!savedIsCurrent && nextAssignments.length) {
            const nextVersion = await saveSeatingLayout(
              supabase, params.id, stored, nextAssignments, saved?.version ?? 0, false
            )
            setVersion(nextVersion)
          }
          return
        } catch (loadError) {
          const delay = SEATING_LOAD_RETRY_DELAYS[attempt]
          if (delay === undefined || !isTransientSeatingLoadError(loadError)) throw loadError
          await waitForRetry(delay)
        }
      }
    } catch (loadError) {
      const message = (loadError as { message?: unknown } | null)?.message
      setError(typeof message === 'string' && message ? message : "Couldn't load the seating plan. Try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialLoadStarted.current) return
    initialLoadStarted.current = true
    void loadData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function persist(nextAssignments: SeatAssignment[], manuallyModified: boolean) {
    if (!managerId) return
    setSaving(true)
    setSaveError('')
    try {
      const nextVersion = await saveSeatingLayout(
        supabase, params.id, managerId, nextAssignments, version, manuallyModified
      )
      setVersion(nextVersion)
      setAssignments(nextAssignments)
    } catch (persistError) {
      setSaveError(persistError instanceof Error ? persistError.message : "Couldn't save this layout.")
    } finally {
      setSaving(false)
    }
  }

  function moveSeat(sourceSeatId: string, destinationSeatId: string) {
    const next = swapSeatAssignments(assignments, sourceSeatId, destinationSeatId)
    setSelectedSeatId(null)
    if (next !== assignments) {
      setSpread('custom')
      void persist(next, true)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragging(false)
    if (event.over) moveSeat(String(event.active.id), String(event.over.id))
  }

  function handleSeatSelect(seatId: string) {
    const occupied = assignments.some((assignment) => assignment.seatId === seatId)
    if (!selectedSeatId) {
      if (occupied) setSelectedSeatId(seatId)
      return
    }
    moveSeat(selectedSeatId, seatId)
  }

  async function regenerate() {
    const selectedSpread = spread === 'custom' ? 'centered' : spread
    setSpread(selectedSpread)
    const recommended = recommendSeating(attendees, signals, selectedSpread).assignments
    await persist(recommended, false)
  }

  async function changeSpread(nextSpread: SeatingSpread) {
    setSpread(nextSpread)
    setSelectedSeatId(null)
    await persist(recommendSeating(attendees, signals, nextSpread).assignments, false)
  }

  async function toggleMySeat() {
    if (!managerId) return
    setSaving(true)
    setSaveError('')
    try {
      const currentlySeated = attendees.some((attendee) => attendee.userId === managerId)
      const ok = await setHostSeatingParticipation(supabase, params.id, managerId, !currentlySeated)
      if (!ok) throw new Error('Only a host or co-host can change this setting.')
      await loadData()
    } catch (toggleError) {
      setSaveError(toggleError instanceof Error ? toggleError.message : "Couldn't update your seat.")
    } finally {
      setSaving(false)
    }
  }

  const managerIsSeated = attendees.some((attendee) => attendee.userId === managerId)
  const orderedAssignments = seatingExportOrder(seats).map((seat) => ({
    seat,
    attendee: attendeeById.get(assignments.find((assignment) => assignment.seatId === seat.id)?.userId ?? ''),
  })).filter((entry): entry is { seat: SeatPosition; attendee: SeatingAttendee } => Boolean(entry.attendee))

  if (printPreview && event) {
    return (
      <div className="sv2-root sv2-seating-print-preview-page">
        <PrintPreviewActions label="PRINT / SAVE SEATING CHART" onBack={() => setPrintPreview(false)} />
        <main className="sv2-seating-print-sheet">
          <header><p>Sofra</p><h1>{event.title}</h1><span>{formatEventDate(event.event_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span></header>
          <RenderedTable attendees={attendees} seats={seats} assignments={assignments} selectedSeatId={null} showOpenSeats={false} onSeatSelect={() => undefined} />
          <ol>
            {orderedAssignments.map(({ seat, attendee }) => (
              <li key={seat.id}>
                <strong>{seat.side === 'head' ? `Head ${seat.index + 1}` : `${seat.side === 'north' ? 'Side A' : 'Side B'} ${seat.index + 1}`}</strong>
                <span>{attendee.name}{attendee.rsvpStatus === 'maybe' ? ' · Maybe' : ''}</span>
                {includeServiceNotes && [...attendee.dietary, ...attendee.avoid].length > 0 && <small>{[...attendee.dietary, ...attendee.avoid].join(' · ')}</small>}
              </li>
            ))}
          </ol>
          {includeServiceNotes && <p className="sv2-seating-sensitive-note">Contains private dietary and allergy notes. Share only with service staff who need them.</p>}
        </main>
      </div>
    )
  }

  return (
    <div className="sv2-root sv2-device-page sv2-app-page sv2-seating-page">
      <main className="sv2-device-shell sv2-app-shell sv2-seating-shell">
        <Link className="sv2-back-link" href={`/events/${params.id}`}>← Event details</Link>
        <header className="sv2-seating-header">
          <p>SOFRA · SEATING</p>
          <h1>Recommended Seating Arrangement</h1>
          {event && <span>{event.title} · {attendees.length} seated</span>}
          {!loading && !error && attendees.length > 0 && (
            <button
              type="button"
              className="sv2-seating-export-icon"
              aria-label="Export seating chart"
              title="Export seating chart"
              aria-expanded={printOptionsOpen}
              onClick={() => setPrintOptionsOpen((open) => !open)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3v12m0-12 4 4m-4-4L8 7M5 13v6h14v-6" />
              </svg>
            </button>
          )}
        </header>
        {loading ? <p>Arranging the table...</p> : error ? (
          <div className="sv2-seating-error"><p role="alert">{error}</p><button type="button" onClick={() => void loadData()}>RETRY</button></div>
        ) : attendees.length === 0 ? (
          <section className="sv2-seating-empty">
            <h2>No seats yet</h2>
            <p>Going and maybe attendees will appear here. Hosts and co-hosts can choose whether to take a seat.</p>
            <button type="button" onClick={() => void toggleMySeat()}>{managerIsSeated ? 'REMOVE MY SEAT' : 'SEAT ME AT THE TABLE'}</button>
          </section>
        ) : (
          <>
            <div className="sv2-seating-toolbar">
              <button type="button" disabled={saving} onClick={() => void regenerate()}>REFRESH RECOMMENDATION</button>
              <button type="button" disabled={saving} onClick={() => void toggleMySeat()}>{managerIsSeated ? 'OPT OUT OF MY SEAT' : 'SEAT ME AT THE TABLE'}</button>
            </div>
            {printOptionsOpen && (
              <section className="sv2-seating-export-options">
                <label><input type="checkbox" checked={includeServiceNotes} onChange={(event) => setIncludeServiceNotes(event.target.checked)} /> Include private dietary/allergy notes for service staff</label>
                <button type="button" onClick={() => setPrintPreview(true)}>OPEN PRINT PREVIEW</button>
              </section>
            )}
            <DndContext
              sensors={sensors}
              onDragStart={() => setDragging(true)}
              onDragCancel={() => setDragging(false)}
              onDragEnd={handleDragEnd}
            >
              <div className="sv2-seating-viewport">
                <RenderedTable attendees={attendees} seats={seats} assignments={assignments} selectedSeatId={selectedSeatId} showOpenSeats={dragging || Boolean(selectedSeatId)} onSeatSelect={handleSeatSelect} />
              </div>
            </DndContext>
            <div className="sv2-seating-spread" role="group" aria-label="Seat spread">
              <span>SEAT SPREAD</span>
              {(['centered', 'corners', 'heads'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={saving}
                  className={spread === option ? 'is-active' : ''}
                  onClick={() => void changeSpread(option)}
                >
                  {option === 'centered' ? 'CENTERED' : option === 'corners' ? 'CORNERS' : 'HEAD SEATS'}
                </button>
              ))}
            </div>
            <div className="sv2-seating-status" aria-live="polite">
              {saving ? 'Saving layout...' : saveError || 'Layout saved'}
            </div>
            <div className="sv2-seating-legend"><span className="is-maybe">MAYBE</span><p>Maybe attendees stay visible and highlighted until their RSVP changes.</p></div>
          </>
        )}
      </main>
    </div>
  )
}
