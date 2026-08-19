# Host Update Messages ("Send an update") — Design Spec
_2026-08-20_

## Goal

Give hosts a way to compose a shareable text update about their event —
photos reminder, a date/time/location update, or a from-scratch message —
that they send themselves through whatever app they choose (WhatsApp,
iMessage, etc.). Sofra never sends anything on the host's behalf; this only
crafts the text and hands it to `navigator.clipboard` or `wa.me`, mirroring
the existing `COPY INVITE LINK` / `SHARE VIA WHATSAPP` pattern already on
the host's event page (`app/(guest)/events/[id]/EventDetailClient.tsx` +
`components/sofra-v2/EventPaper.tsx`).

This spec covers a new pure template-builder module, a new host-only page,
and one new button on the existing event-paper share row. It does not touch
menu generation, RSVP, or any deterministic recommendation logic.

---

## Trigger button

Add `SEND AN UPDATE` to the existing `.sv2-host-share-actions` row in
`EventPaper.tsx`, alongside `COPY INVITE LINK` and `SHARE VIA WHATSAPP`
(all three host-only, rendered only when `isHost`). Clicking it navigates to
`/events/[id]/update`.

## New page: `app/(guest)/events/[id]/update/page.tsx`

Follows the same shape as `app/(guest)/events/[id]/chat/page.tsx`:

- Client component, loads the event row (`id, host_id, title, event_date,
  venue, address`) from Supabase by `params.id`.
- Access check: reuse the existing `isEventManager(supabase, eventId,
  userId, hostId)` helper (`lib/event-access.ts`), already used elsewhere to
  grant hosts and accepted co-hosts the same management access (Table,
  Kitchen, Menu, Recipes per the delegated-kitchen work). Anyone else sees
  the same access-error pattern as the chat page and a link back to the
  event.
- `← Event details` back link at the top, matching Chat/Album.
- Three template buttons: **Photos are up**, **Update to date/time/location**,
  **Custom**.
- One editable `<textarea>` holding the entire message, including the
  invite link as plain, editable text — selecting a template overwrites the
  textarea's current value; typing afterward is fully free-form.
- `COPY MESSAGE` button: clipboard write of the current textarea value,
  with the same copied-state/fallback-input UX already used by
  `copyInviteLink` in `EventDetailClient.tsx` (show `COPIED!` briefly; on
  clipboard failure, show a read-only fallback input with the text
  selected).
- `SHARE VIA WHATSAPP` button: `window.open('https://wa.me/?text=' +
  encodeURIComponent(currentTextareaValue), '_blank')` — same `wa.me`
  pattern as `shareViaWhatsApp`, but built from the current textarea value
  instead of a fixed message.

No template selected initially; the textarea starts pre-filled with the
`custom` template output (see below) so the invite link is present even if
the host starts typing immediately without picking a template.

## Template builder: `lib/event-updates.ts`

Pure functions, no Supabase/React dependency — mirrors the shape of
`lib/event-date.ts` / `lib/event-images.ts`.

```ts
export type UpdateTemplateId = 'photos' | 'details' | 'custom'

export type UpdateEventInput = {
  title: string
  event_date: string
  venue: string | null
  address: string | null
}

export function buildUpdateMessage(
  templateId: UpdateTemplateId,
  event: UpdateEventInput,
  inviteUrl: string,
  albumUrl: string
): string
```

`albumUrl` and `inviteUrl` are both built by the page from the existing
`canonicalEventUrl`-style helper already in `EventDetailClient.tsx`
(`new URL('/events/' + id [+ '/album'], window.location.origin).toString()`),
not by this module — keeping this module free of `window` so it stays unit
testable in Node.

### `photos`

```
Photos from {title} are up! Add yours to the shared album: {albumUrl}

{inviteUrl}
```

### `details`

Built line-by-line depending on what's actually decided right now, using
the existing `isEventDateUndecided` check from `lib/event-date.ts` — never
inventing a value that hasn't been set:

- Date/time decided → one line with the formatted date and time (reuse the
  same `toLocaleDateString`/`toLocaleTimeString` formatting already used by
  `formatDate`/`formatTime` in `EventDetailClient.tsx`).
- Date/time still undecided → `"Date & time: still being finalized"`.
- Venue present → one line with the venue, plus `" — " + address` if an
  address is also set.
- No venue → `"Location: still being finalized"`.
- Always ends with a blank line then `{inviteUrl}`.

Example, fully decided:
```
Update on Layla's Long Table:
Wednesday, August 11, 2027 at 7:00 PM
Krasi — Meze & Wine, 48 Gloucester St, Boston

{inviteUrl}
```

Example, nothing decided yet:
```
Update on Layla's Long Table:
Date & time: still being finalized
Location: still being finalized

{inviteUrl}
```

### `custom`

```
{inviteUrl}
```

Just the invite link, so it's never silently dropped even when the host
types a message from scratch. The host can still delete it since the
textarea is fully editable.

## Self-review

- `event_date`/`venue`/`address` and the invite/album URLs used by the page
  come from the same live Supabase row and the same `canonicalEventUrl`-
  style construction already used elsewhere on this page — no separate
  fetch, no caching layer, so nothing here can go stale independent of the
  rest of the event page.
- `buildUpdateMessage` is a pure function verified directly against
  `isEventDateUndecided` true/false and present/absent venue combinations
  in unit tests — not by manual inspection.

## Testing

- `lib/event-updates.ts` unit tests: all three templates, crossed with
  decided/undecided date and present/absent venue for the `details`
  template (4 combinations) — asserting exact output strings including the
  appended invite URL.
- `app/(guest)/events/[id]/update/page.tsx` test (mirroring
  `__tests__/event-detail-page.test.tsx` conventions): host access allowed,
  non-host/non-cohost access denied, clicking each template button fills
  the textarea with the expected content, `COPY MESSAGE` writes the
  textarea's current (possibly hand-edited) value to the clipboard, and
  `SHARE VIA WHATSAPP` opens a `wa.me` URL built from that same current
  value.

## Out of scope

- Sofra never sends the message itself — no server-side send, no message
  history, no delivery tracking.
- No new database table or column; this reads existing `events` fields only.
- No changes to RSVP, menu generation, or any deterministic recommendation
  logic.
