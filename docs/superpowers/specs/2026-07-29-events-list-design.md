# Events List Page — Design Spec

**Date:** 2026-07-29  
**File:** `app/(guest)/events/page.tsx`

## Summary

Build the missing events list page for the guest route group. Currently only the dynamic `app/(guest)/events/[id]/` route exists. This page shows a logged-in user's two sets of events in a single dashboard view.

## Context

- **Auth mechanism:** `sofra_user_id` is stored in `localStorage` only. No cookie. No server-side session. The middleware is a no-op pass-through.
- **RLS:** Fully disabled for MVP (migration 20260728000005). Queries run as anon.
- **All other pages** with user-scoped data are `'use client'` components reading localStorage in `useEffect`. This page matches that pattern exactly.

## Component

**Type:** `'use client'` client component — server component is not viable because the user ID lives in localStorage, not a cookie or session.

**File:** `app/(guest)/events/page.tsx`

## Identity / Auth

`useEffect` reads `localStorage.getItem('sofra_user_id')`. If absent, `router.push('/login')`. No render until ID is confirmed.

## Data Fetching

Two parallel Supabase client queries via `Promise.all`, run after the user ID is available:

1. **Hosting**: `supabase.from('events').select('id,title,event_date,venue,theme,cover_url').eq('host_id', uid)`
2. **Invited**: `supabase.from('rsvps').select('status, events(id,title,event_date,venue,theme,cover_url)').eq('user_id', uid).in('status', ['going','maybe'])`

Both queries are scoped to the current user's ID — not all events.

## Schema Used

| Table | Columns |
|-------|---------|
| `events` | `id`, `host_id`, `title`, `event_date`, `venue`, `theme`, `cover_url` |
| `rsvps` | `event_id`, `user_id`, `status` (enum: going/maybe/cant) |

## Render

### Loading state
Three skeleton pulse cards (same `skPulse` keyframe as RSVP page) while `loading === true`.

### Sections
Two titled sections rendered when data is available:
- **"Hosting"** — events where the user is the host
- **"Your invites"** — events the user RSVPed going/maybe to

### Event card
Each card links to `/events/[id]` and shows:
- Cover area: `cover_url` image if present, else theme gradient (THEMES map from host/new/page)
- Title (Georgia serif)
- Formatted date (e.g., "Sat, Aug 9 · 7:00 PM")
- Venue (if set)

### Empty state
If both lists are empty after loading, show a friendly message ("No events yet") with a button linking to `/host/new`.

### Error state
Message + Retry button (same pattern as RSVP page's fetch-error block).

## Style

Matches every other page exactly:
- `const C = { ink, ink2, burgundy, burgundyLit, cream, dim, faint, gold, rose }` — same hex values
- `minHeight: 100vh`, `background: linear-gradient(180deg, #1B1214 0%, #241619 100%)`
- Radial gold glow at top: `radial-gradient(ellipse 80% 40% at 50% 0%, rgba(217,161,91,0.18) 0%, transparent 70%)`
- Georgia serif wordmark "Sofra" at top
- All layout via inline styles (no Tailwind, no CSS modules)

## No new abstractions

No shared components, no new hooks, no separate files. Single self-contained page component.
