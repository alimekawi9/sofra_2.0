# Login Flow — Design Spec
_2026-07-27_

## Goal

Build the Sofra phone-OTP login flow at `app/(auth)/login/page.tsx`. Three steps: phone entry → OTP verification → (first-time users only) name capture. On success, redirect to `/events`.

---

## File

Single file: `app/(auth)/login/page.tsx`
- `'use client'` directive
- No sub-components needed at this scale

---

## Step Machine

```ts
type Step = 'phone' | 'otp' | 'name'
```

State: `step: Step`, `phone: string`, `otp: string`, `name: string`, `error: string`, `loading: boolean`, `resendCooldown: number`

Flow:
```
'phone' → 'otp' → ('name' | router.push('/events'))
```

---

## Supabase Auth Sequence

### Step 1 — Phone

- User enters raw digits (no live formatting)
- On submit: strip non-digits, prepend `+1`, call `supabase.auth.signInWithOtp({ phone: e164 })`
- On success: advance to `'otp'`, start 30-second resend cooldown
- On error: display inline error message

### Step 2 — OTP

- User enters 6-digit code (Supabase default)
- On verify: call `supabase.auth.verifyOtp({ phone: e164, token: otp, type: 'sms' })`
- On success: query `public.users` using `.maybeSingle()` — returns `null` cleanly for new users, no throw
  - Row found → `router.push('/events')`
  - Row not found → advance to `'name'`
- On error: display inline error, stay on OTP step

#### Resend Cooldown

- After sending OTP (initial or resend), start a `resendCooldown` counter at 30
- Decrement every second via `setInterval`; clear interval when it hits 0
- Resend button is disabled + shows `"Resend in Xs"` while cooldown is active
- When cooldown expires, button re-enables as `"Resend code"`
- Clicking resend calls `signInWithOtp` again and resets cooldown to 30

### Step 3 — Name (first-time users only)

- User enters their first name
- On submit: `supabase.from('users').insert({ id: auth.uid(), phone: e164, name: name.trim() })`
  - RLS policy `users_insert_self` requires `id = auth.uid()` — pass explicitly
- **Insert failure handling:** if insert errors (race condition — row created in another tab, duplicate phone edge case):
  - Retry lookup with `.maybeSingle()`
  - If row now exists → `router.push('/events')` (silent recovery)
  - If still no row → set error: `"Something went wrong. Please refresh and try again."`
- On success: `router.push('/events')`

---

## Loading State

`loading = true` during all three async calls:
- `signInWithOtp`
- `verifyOtp`
- `users` lookup + `users` insert

Primary button is `disabled={loading}` throughout. Prevents double-submit on slow networks (critical for `verifyOtp` — calling it twice on the same token can cause a spurious "Token has expired or is invalid" error).

---

## Error Display

- Inline `<p>` below the primary button, per step
- Cleared on each new submission attempt
- Color: rose `#C97B6E`

---

## Phone Handling

- State stores raw input value as typed (no live formatting)
- Placeholder shows `(___) ___-____` for UX hint, input type `tel`
- E.164 conversion at submit time only: `'+1' + rawPhone.replace(/\D/g, '')`
- US-only for now; international support deferred

---

## Styling — Inline Styles (Option B)

Color palette (defined as a `const C` object at top of file):
```ts
const C = {
  ink: '#140E10',
  ink2: '#1E1518',
  burgundy: '#5C1A1B',
  burgundyLit: '#7A2324',
  cream: '#F3E9DD',
  dim: '#B7A493',
  faint: '#7C6B5F',
  gold: '#D9A15B',
  rose: '#C97B6E',
}
```

Key visual elements:
- **Background**: `linear-gradient(180deg, #1B1214 0%, #241619 100%)` — near-black, warm undertone
- **Radial glow**: `radial-gradient(ellipse 80% 40% at 50% 0%, rgba(217,161,91,0.18) 0%, transparent 70%)` overlaid at top — the "candlelight"
- **Wordmark**: 52px italic Georgia, color `cream`, centered
- **Tagline**: 15px, `dim`, sans-serif
- **Inputs**: `rgba(0,0,0,0.24)` bg, `1px solid rgba(243,233,221,0.16)` border, `14px` border-radius, gold border on focus
- **Primary button**: bg `burgundy`, hover `burgundyLit`, warm box-shadow glow
- **OTP input**: `26px` font, `14px` letter-spacing, centered, maxLength 6

No Tailwind config changes. No new CSS files.

---

## Redirect

`useRouter` from `next/navigation`, `router.push('/events')` on:
- Returning user detected after OTP verify
- New user insert success
- New user insert failure with row found on retry

---

## Out of Scope

- International phone numbers
- Live phone number formatting (format-as-you-type)
- Email fallback auth
- Photo upload on name step (deferred — schema has `photo_url` nullable)
