# Custom Event Detail Sections + Photo Deletion — Design

## Context

Two independent, host-facing gaps in the production event experience:

1. The event detail page (`EventPaper`) shows a fixed set of rows — Date, Time,
   Location, Dress code — with no way for a host to add anything else (parking
   instructions, gift registry notes, a Zoom link, etc.).
2. The Shared Album lets anyone upload photos but nobody can ever remove one,
   including the person who uploaded it or the host running the event.

Both are scoped together here because they were brainstormed in the same
session, but they touch disjoint code paths (event details vs. shared album)
and can be implemented and shipped independently.

## Part 1: Custom Event Detail Sections

### Data model

New nullable-free JSONB column on `events`:

```sql
alter table public.events
  add column custom_details jsonb not null default '[]'::jsonb;
```

Shape: an ordered array of

```ts
type CustomDetailSection = {
  id: string      // generated client-side, e.g. crypto.randomUUID()
  label: string    // e.g. "Parking" — rendered uppercase via existing CSS
  body: string     // free text, rendered as-is
}
```

Array order **is** display order — no separate `order` field needed, since
(unlike the questionnaire's canonical + custom question interleaving) this is
a flat list of purely host-authored sections with nothing else mixed in.

No RLS/grant changes needed: `events` already has open MVP-model grants:
custom_details is just another column on an existing writable row.

### Editing (host create/edit form)

Both `HostCreateForm` (used by `/host/new`) and the host edit page
(`/host/[id]/edit`) already manage `dressCode` as a single controlled string.
Add alongside it a repeatable list, mirroring the existing custom-questionnaire
question editor's interaction pattern (`QuestionnaireEditor.tsx`'s "+ ADD
QUESTION" / "REMOVE" convention):

- A "+ ADD DETAIL SECTION" button appends a new `{ id, label: '', body: '' }`
  row to local state.
- Each row renders a label `<input>` and a body `<textarea>`, plus a
  "REMOVE" button that drops that row from local state immediately (no
  confirmation needed — this only affects an in-progress, unsaved edit).
- On submit, rows where `label.trim()` or `body.trim()` is empty are dropped
  (not persisted half-filled). Remaining rows are trimmed and sent as
  `custom_details` in the same update/insert payload as `dress_code` etc.
- On load (edit page), `custom_details` is hydrated back into the same local
  row-list state, so existing sections re-render as editable rows exactly the
  same way `dressCode` already round-trips.

No hard cap on section count — matches the existing custom-questionnaire
questions, which also have no cap.

### Display (`EventPaper`)

New prop:

```ts
customDetails?: CustomDetailSection[]
```

Rendered inside the existing `<dl className="sv2-event-facts">` block,
appended immediately after the Dress code row and before the guest's own "Your
RSVP" row:

```tsx
{customDetails?.map((section) => (
  <div key={section.id}>
    <dt>{section.label}</dt>
    <dd>{section.body}</dd>
  </div>
))}
```

This is the *exact* existing `dt`/`dd` markup used by Date/Time/Location/Dress
code, so it automatically inherits the same uppercase-label, same row
spacing/border styling — no new CSS.

**Visibility:** always shown to anyone who opens the invite link, same as
Dress code today (not gated behind the RSVP-unlock boundary that the exact
street address uses) — these are host-authored public details, not sensitive
location data.

`EventDetailClient.tsx` passes `event.custom_details` straight through from
its existing event fetch (needs `custom_details` added to the `select(...)`
column list) — no new query.

### Testing

- `HostCreateForm` / host edit page: add a section, remove a section, submit
  with a section that has a label but empty body (dropped), round-trip an
  existing section on load.
- `EventPaper`: renders zero, one, and multiple custom detail rows in the
  correct position (after Dress code, before Your RSVP), in order.
- Full flow (`event-detail-page.test.tsx` or equivalent): a saved custom
  section round-trips from creation through to guest-facing display.

## Part 2: Photo Deletion

### Permission model

A photo is deletable by:
- the user who uploaded it (`photo.uploaded_by === currentUserId`), or
- the event host (`event.host_id === currentUserId`).

Enforced client-side only, consistent with this app's existing anonymous
MVP-access model for the album (`event_photos` already has RLS disabled and
open grants — see `docs/DECISION_LOG.md` / `IMPLEMENTATION_STATUS.md`'s
existing "RLS remains disabled under the explicitly accepted anonymous-access
MVP model" precedent for chat and photos). No new API route or server-side
check; the delete button is simply not rendered/enabled when neither
condition holds.

### Deletion mechanics (`lib/shared-album.ts`)

New function:

```ts
export async function deletePhoto(
  supabase: SupabaseClient,
  photo: { id: string; storage_path: string }
): Promise<{ ok: boolean; error?: string }>
```

Sequence: remove the Storage object (`supabase.storage.from('event-photos').remove([photo.storage_path])`),
then delete the `event_photos` row (`.delete().eq('id', photo.id)`). Photo
comments cascade-delete automatically via the existing
`event_photo_comments.photo_id references event_photos(id) on delete cascade`
foreign key — no extra cleanup needed there.

If the storage removal fails, still attempt the row delete (a dangling
storage object is a harmless orphan; a dangling DB row pointing at a live
photo the UI still shows is the worse failure mode) — mirrors the existing
upload path's philosophy of preferring to fail toward "row and file agree."

For bulk delete, add:

```ts
export async function deletePhotoBatch(
  supabase: SupabaseClient,
  photos: Array<{ id: string; storage_path: string }>,
  onProgress?: (completed: number, total: number) => void
): Promise<{ succeededCount: number; failedCount: number }>
```

reusing the existing `runBatchWithConcurrency` helper the same way
`downloadPhotosBatch` already does.

### UI: full-screen photo viewer

Add a DELETE button, shown only when the current viewer is the uploader or
the host. Pressing it flips to an inline two-step confirm (matching the
existing "remove guest" confirm-in-place pattern in `EventPaper` — no modal),
e.g. "Delete this photo?" / "Yes, delete" / cancel. On confirmed delete: call
`deletePhoto`, then close the viewer back to the grid and refresh the album
list. On failure: show an inline error, viewer stays open.

### UI: select mode

Add a DELETE button in the existing SELECT/SAVE/CANCEL bar, next to SAVE.
Pressing it:

1. Filters the current `selectedIds` down to photos the viewer is allowed to
   delete (their own, or all of them if host).
2. If that filtered set is empty, show an inline message ("You can only
   delete your own photos.") and do nothing else.
3. Otherwise asks for the same two-step inline confirmation as the viewer
   (batch-worded: "Delete N photos?"), then calls `deletePhotoBatch`.
4. Reuses the existing partial-result UX already established for uploads/saves:
   if fewer photos were deleted than were selected (because some were skipped
   as not-yours), show "Deleted X of Y — you can only delete your own
   photos." Same visual treatment as the existing partial-upload/partial-save
   states (`PhotoUploadProgress/PhotoSaveProgress`-style), not a new pattern.
5. On success, exits select mode and refreshes the album.

### Testing

- `lib/shared-album.ts`: `deletePhoto` removes storage + row; `deletePhotoBatch`
  reports partial success when some deletes fail.
- Album page: DELETE button appears in the viewer only for the uploader or
  host, not for other guests; confirm-then-delete flow; select-mode bulk
  delete filters to only-deletable photos and reports a partial count when
  some selected photos aren't the viewer's own.

## Migration

One new migration file:
`supabase/migrations/20260820000001_add_event_custom_details.sql`

```sql
alter table public.events
  add column custom_details jsonb not null default '[]'::jsonb;
```

No new tables, no RLS changes (matches the existing `events` grants), no
backfill needed (`default '[]'::jsonb` covers every existing row).

## Out of scope

- Reordering custom detail sections via drag-and-drop (array order is fixed
  by add-order; a host who wants a different order removes and re-adds).
- Any locked/RSVP-gated visibility option for custom sections (always public,
  per the approved design).
- Undo for a deleted photo (deletion is permanent, matching how removing a
  guest today is also permanent).
