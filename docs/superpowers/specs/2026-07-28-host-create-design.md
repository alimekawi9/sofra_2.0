# Host Create Page — Design Spec
_2026-07-28_

## Goal

Build the host event-creation form at `app/(host)/host/new/page.tsx`. Fields: title,
tagline, date & time, venue, dress code, and a five-swatch theme picker. Cover photo
upload to Supabase Storage with live preview as the invite background. On submit:
upload the cover file (if picked), then insert into `events` with `host_id = auth.uid()`,
then redirect to `/events/[id]`.

---

## File

Single file: `app/(host)/host/new/page.tsx`
- `'use client'` directive
- No sub-components
- Same inline-style pattern, same color palette `C`, same `<style>` tag approach as
  login and RSVP pages

---

## Themes

Defined at module scope, used by both the swatches and the cover button background:

```ts
const THEMES = [
  { id: 'ember',    name: 'Ember',    bg: 'radial-gradient(120% 80% at 50% 0%, #7A2324 0%, #3A1416 45%, #140E10 100%)', accent: '#D9A15B' },
  { id: 'olive',    name: 'Olive',    bg: 'radial-gradient(120% 80% at 50% 0%, #5B6B4E 0%, #2E3826 50%, #14140E 100%)', accent: '#D9C05B' },
  { id: 'midnight', name: 'Midnight', bg: 'radial-gradient(120% 80% at 50% 0%, #26304A 0%, #161C2E 50%, #0C0E14 100%)', accent: '#C97B6E' },
  { id: 'saffron',  name: 'Saffron',  bg: 'radial-gradient(120% 80% at 50% 0%, #B5701E 0%, #6E4212 50%, #17100A 100%)', accent: '#F3D9A0' },
  { id: 'plum',     name: 'Plum',     bg: 'radial-gradient(120% 80% at 50% 0%, #4A2540 0%, #2A162A 50%, #120A12 100%)', accent: '#D98FB0' },
]
```

---

## State Shape

```ts
// Refs
const fileInputRef = useRef<HTMLInputElement>(null)   // hidden <input type="file">
const coverFileRef = useRef<File | null>(null)         // File picked by user; read on submit
const uidRef       = useRef<string | null>(null)       // auth uid stored on mount

// State
const [theme,      setTheme]      = useState('ember')
const [previewUrl, setPreviewUrl] = useState<string | null>(null)
const [title,      setTitle]      = useState('')
const [tagline,    setTagline]    = useState('')
const [date,       setDate]       = useState('')
const [venue,      setVenue]      = useState('')
const [dressCode,  setDressCode]  = useState('')
const [submitting, setSubmitting] = useState(false)
const [error,      setError]      = useState('')
```

### Column mapping

| State var  | DB column          | Nullable |
|------------|--------------------|----------|
| `title`    | `events.title`     | NO — required |
| `tagline`  | `events.tagline`   | yes |
| `date`     | `events.event_date`| NO — required |
| `venue`    | `events.venue`     | yes |
| `dressCode`| `events.dress_code`| yes |
| `theme`    | `events.theme`     | yes (default `'ember'`) |
| `publicUrl`| `events.cover_url` | yes |

### Cover split rationale

`coverFileRef` holds the raw `File` so the submit handler can pass it to
`supabase.storage.upload()` without triggering a re-render on pick.
`previewUrl` is state so the cover button re-renders immediately when a photo is
chosen, giving the live preview.

`theme` defaults to `'ember'` in state — matching the DB column default — so the
picker always opens with the first swatch pre-outlined. There is no unselected state.

---

## Mount Auth Check

```ts
async function init() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) { router.push('/login'); return }
  uidRef.current = user.id
}
useEffect(() => { init() }, [])
```

- No loading state is shown while this resolves — the form renders immediately since
  there is no server data to fetch. The user can fill in fields before the check
  completes; the uid is only needed at submit time.
- Submit is guarded by `if (!uidRef.current || submitting) return` at the top of
  the handler — same discipline as the RSVP page.
- `router.push('/login')` fires immediately if unauthenticated; the form never stays
  visible to logged-out users.

---

## Live Preview — Cover Button + Theme Swatches

### Cover button

Full-width tappable area, `240px` tall, `border-radius: 16px`, `overflow: hidden`.
Clicking calls `fileInputRef.current?.click()`.

**No cover uploaded:**
- Background: active theme's `t.bg` gradient
- Radial glow overlay (position absolute, `pointerEvents: none`):
  `radial-gradient(ellipse 80% 40% at 50% 0%, rgba(217,161,91,0.18) 0%, transparent 70%)`
- Centered: `＋` glyph above `"Upload cover photo"` label in `dim`
- Bottom-left badge: `"Recommended 1:1"` — `rgba(0,0,0,0.45)` pill, `cream` text, `12px`

**Cover uploaded:**
- `<img src={previewUrl}>` filling the button (`width: 100%`, `height: 100%`,
  `objectFit: cover`)
- Bottom-left badge: `"Change photo"` — same pill style

**No remove-cover affordance (v1 intentional):** once a photo is uploaded the only
option is "Change photo" to a different file. A host who wants no cover photo simply
never uploads one. This is a deliberate v1 scope decision, not an oversight.

### File input handler

```ts
function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file) return
  coverFileRef.current = file
  setPreviewUrl(URL.createObjectURL(file))
}
```

### Theme swatches

Horizontal scrollable row below the cover button, `gap: 10px`, `overflowX: auto`.
Each swatch: `minWidth: 88px`, `height: 60px`, `border-radius: 14px`,
`background: t.bg`. Selected: `outline: 2px solid t.accent`. Unselected:
`outline: 2px solid transparent`. Swatch name in `cream`, `12px`, centered.

Selecting a swatch calls `setTheme(t.id)` and immediately updates the cover button
background (when no photo is uploaded). When a photo is uploaded the theme is still
saved and written to `events.theme` — it serves as the fallback background on the
event page when `cover_url` is null.

---

## Form Fields

Six labeled fields stacked vertically, `gap: 20px`.

| Label       | Input type       | Placeholder                                    | Required |
|-------------|------------------|------------------------------------------------|----------|
| Title       | `text`           | `"Dinner at Casa Mekawi"`                      | yes      |
| Tagline     | `text`           | `"A night of good food and conversation"`      | no       |
| Date & Time | `datetime-local` | —                                              | yes      |
| Venue       | `text`           | `"The Garden Room, San Francisco"`             | no       |
| Dress code  | `text`           | `"Smart casual"`                               | no       |

**Input styling:** `rgba(0,0,0,0.24)` background, `1px solid rgba(243,233,221,0.16)`
border, `border-radius: 14px`, `padding: 12px 16px`, `color: cream`, `14px` font.
Gold border on focus via `<style>` tag.

**Labels:** `12px`, `dim`, rendered as `<p>` above each input.

**"Publish invite" button:** `burgundy` background, `cream` text, `border-radius: 12px`,
warm box-shadow glow. Disabled (`opacity: 0.5`, `cursor: default`) when `title` or
`date` is empty, or `submitting` is true. Only `title` and `date` gate the button
since they are the only NOT NULL columns.

**Timezone note:** `datetime-local` produces a timezone-naive string. The submit
handler explicitly calls `new Date(date).toISOString()` before writing to Supabase.
`new Date()` interprets the string in the browser's local timezone; `.toISOString()`
converts to UTC. Raw pass-through is never done.

**Min date:** no `min` attribute — past dates are intentionally allowed in v1. Hosts
may create events retroactively. A `min` constraint can be added later if product
decides past-date creation is undesirable.

**Inline error:** `<p>` in `rose` (`#C97B6E`), `13px`, centered, below the button
when `error` is non-empty.

---

## Submit Flow

```ts
async function handleSubmit() {
  if (!uidRef.current || submitting) return
  setSubmitting(true)
  setError('')

  // Step 1: Upload cover photo (fully resolves before insert — no parallel execution)
  let publicUrl: string | null = null
  if (coverFileRef.current) {
    const file = coverFileRef.current
    const ext  = file.name.split('.').pop() ?? 'jpg'
    const path = `${uidRef.current}/${crypto.randomUUID()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('covers')
      .upload(path, file)

    // Upload failure: abort entire submit — event row is never inserted
    if (uploadError) {
      setError('Photo upload failed. Please try again.')
      setSubmitting(false)
      return
    }

    publicUrl = supabase.storage
      .from('covers')
      .getPublicUrl(path).data.publicUrl
  }

  // Step 2: Insert event row (only reached if Step 1 succeeded or was skipped)
  const { data, error: insertError } = await supabase
    .from('events')
    .insert({
      host_id:    uidRef.current,
      title,
      tagline:    tagline   || null,
      event_date: new Date(date).toISOString(),
      venue:      venue     || null,
      dress_code: dressCode || null,
      theme,
      cover_url:  publicUrl,
    })
    .select('id')
    .single()

  if (insertError) {
    setError('Something went wrong. Please try again.')
    setSubmitting(false)
    return
  }

  // Step 3: Redirect — submitting is not reset (redirect handles cleanup)
  router.push('/events/' + data.id)
}
```

**Guarantees:**
1. Upload fully resolves to `publicUrl` before insert fires — sequential `await`, no `Promise.all`
2. Upload error → `setError` + `setSubmitting(false)` + `return` — insert line never reached
3. Insert error → `setError` + `setSubmitting(false)` + `return` — no redirect
4. `setSubmitting(false)` appears on every error path; success path does not reset it

---

## Styling

**Color palette:** same `const C` object as login and RSVP pages. Theme accent colors
are read from `THEMES[i].accent` and used only for swatch outlines.

**Page background:** `linear-gradient(180deg, #1B1214 0%, #241619 100%)` with
radial glow overlay, wordmark (`Sofra`, 52px italic Georgia, `cream`), and
back link (`← Events`, `dim`, `router.push('/events')`).

**`<style>` tag:**

```css
input:focus {
  outline: none;
  border-color: #D9A15B;
}
input[type="datetime-local"]::-webkit-calendar-picker-indicator {
  filter: invert(0.6);
}
```

All other styles are inline. No Tailwind config changes. No new CSS files.

---

## Adjacent Requirement — Event Page Host Unlock

When the current user is the event's host (`event.host_id === auth.uid()`), the
guest event page at `app/(guest)/events/[id]/page.tsx` must always render the
unlocked state (full guest list, address, shared album) regardless of whether a
personal `rsvps` row exists. A host does not RSVP to their own event.

This spec does not implement the event page. It documents the contract so both
pages can be built consistently.

---

## Storage Bucket

Bucket name: `covers`. Paths follow `{userId}/{uuid}.{ext}`. The bucket must have
public read access so `getPublicUrl()` returns a usable URL without a signed token.
Bucket creation and policy configuration are infrastructure setup, not part of this
page's implementation.

---

## Out of Scope

- Remove-cover-photo affordance (v1 intentional — see Live Preview section)
- Past-date restriction on `datetime-local` (v1 intentional — see Form Fields section)
- Edit event (separate flow — this page is create-only)
- `app/(guest)/events/[id]/page.tsx` (adjacent requirement documented above)
- International timezone display (host enters local time; UTC conversion happens on submit)
