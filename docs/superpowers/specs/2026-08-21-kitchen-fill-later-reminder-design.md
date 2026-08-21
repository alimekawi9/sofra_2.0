# Kitchen "Fill In Later" Reminder — Design

## Goal

When a host creates an event and picks "FILL IN LATER" for Kitchen setup, they currently get no
follow-up — the choice isn't even persisted. Give that host a reminder on their own Event Details page,
so they don't forget to come back and fill in the Kitchen before the invite really needs it.

## Background: what already exists

- `HostCreateForm`'s creation-time `kitchenPlan` field (`'now' | 'later' | 'chef'`,
  `app/(host)/host/new/page.tsx:35`) already asks the question, but the value is only ever used locally
  to decide the post-save redirect (`router.push(...)` at lines 130–132). It is never included in the
  insert payload (`app/(host)/host/new/page.tsx:85-98`), so today "chose Later," "chose Now but never
  finished," and "chose Chef but nobody's accepted yet" are indistinguishable in the database — all three
  leave `kitchen_status: 'pending'`, `chef_id: null`.
- `events.kitchen_status` (`'pending' | 'complete'`, migration `20260818000001_add_kitchen_delegation.sql`)
  already exists and already flips to `'complete'` when the host submits Kitchen inventory. Pre-existing
  rows (created before this column existed) were backfilled to `'complete'`, so only events created going
  forward can ever be `'pending'`.
- The exact precedent for a host-only reminder banner already exists: `hostNeedsPreferences` in
  `app/(guest)/events/[id]/EventDetailClient.tsx` (computed from a missing/incomplete taste profile) is
  passed to `EventPaper.tsx`, which renders `<aside className="sv2-host-preferences-notice">` with a
  heading, one line of body copy, and a single action button. It has no dismiss control — it simply stops
  rendering once the underlying condition (missing preferences) resolves.

## Design

### 1. Persist the original choice

New migration adds `events.kitchen_plan text`, nullable, `check (kitchen_plan in ('now', 'later',
'chef'))`. No backfill needed — every pre-existing row is already `kitchen_status = 'complete'`, so this
new column being `null` for them is correct (there's nothing to remind them about regardless).

`app/(host)/host/new/page.tsx`'s insert payload (currently ending `is_published: publish, kitchen_status:
'pending'`) gains one more field: `kitchen_plan: kitchenPlan`. This is the only write site — the value
is set once at creation and never changed afterward (mirrors how `kitchen_status` itself is only ever
flipped forward by the actual Kitchen submission, never edited directly).

### 2. Reminder condition — deliberately narrow

The reminder shows only when **all** of:
- the viewer is the host or an accepted co-host (`hostViewing`, same check `hostNeedsPreferences` uses),
- `kitchen_status === 'pending'`,
- `kitchen_plan === 'later'`.

An abandoned "Fill Kitchen Now" attempt or a "Send to a Chef" invite that hasn't been accepted/finished
yet get no reminder here — that's out of scope for this request. (If a future request wants those covered
too, this condition is the only place that would need to change.)

### 3. UI

`components/sofra-v2/EventPaper.tsx` gains two new props, following the exact shape of the existing
`hostNeedsPreferences`/`onAddHostPreferences` pair:

```ts
hostNeedsKitchen: boolean
onAddHostKitchen: () => void
```

Rendered directly below the existing preferences `<aside>` (both can show at once — a host can be
missing their taste profile and have a pending "later" Kitchen simultaneously; they're independent
reminders, stacked), reusing the same `sv2-host-preferences-notice` class so it's visually identical to
the existing reminder with zero new CSS:

```tsx
{hostNeedsKitchen && (
  <aside className="sv2-host-preferences-notice">
    <div>
      <strong>YOUR KITCHEN IS STILL WAITING</strong>
      <p>Pick up where you left off before the invite goes out.</p>
    </div>
    <button type="button" onClick={onAddHostKitchen}>FILL KITCHEN NOW</button>
  </aside>
)}
```

`onAddHostKitchen` navigates to `/kitchen?from={eventId}` — the same route `host/new/page.tsx` already
uses for the "now" path, so the Kitchen page's existing draft-return behavior is unchanged.

### 4. Wiring

`app/(guest)/events/[id]/EventDetailClient.tsx`'s existing `events` select
(`id,host_id,chef_id,title,tagline,event_date,venue,address,dress_code,custom_details,theme,cover_url,is_published`)
gains `kitchen_status,kitchen_plan`. A new `hostNeedsKitchen` state is computed alongside the existing
`hostNeedsPreferences` computation (same `hostViewing` gate), and passed to `EventPaper` alongside a new
`onAddHostKitchen={() => router.push('/kitchen?from=' + params.id)}` handler.

No new fetches — this piggybacks on the event row already being loaded for every other purpose on this
page.

### Error handling

No new failure surface: the two new columns are read from the same `events` query that already runs
unconditionally, so there's no new code path that can fail independently. If that query fails, the page
already shows its existing load-error state, same as today.

## Testing

- `__tests__/event-detail-page.test.tsx`: extend `SAMPLE_EVENT` with `kitchen_status: 'complete'`,
  `kitchen_plan: null as 'now' | 'later' | 'chef' | null` defaults (so all existing tests are
  unaffected), then add a `describe('Host kitchen reminder')` block mirroring `describe('Host preference
  reminder')`:
  - shows the reminder and navigates to `/kitchen?from=ev-1` on click, for `kitchen_status: 'pending',
    kitchen_plan: 'later'`;
  - hides it when `kitchen_plan` is `'now'` or `'chef'` (even with `kitchen_status: 'pending'`);
  - hides it when `kitchen_status` is `'complete'` regardless of `kitchen_plan`;
  - hides it for a non-host guest viewer even when the event itself qualifies.
- `__tests__/host-new-page.test.tsx`: assert the insert payload includes `kitchen_plan` matching whichever
  of the three buttons was clicked before Continue.

## Acceptance criteria

- Picking "FILL IN LATER" at creation is now recorded on the event row.
- That host, and only that host (or an accepted co-host), sees a reminder on Event Details until Kitchen
  is actually submitted.
- Picking "FILL KITCHEN NOW" or "SEND TO A CHEF" never triggers this specific reminder, even if Kitchen
  ends up incomplete through that path too.
- No new fetches, no new CSS, no dismiss state to persist.
