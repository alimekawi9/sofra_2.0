# Event TBD-Field Suggestions — Design

## Goal

When a host still has an undecided event date/time or an unset venue/location, and guests have already
answered a custom survey question that's actually *about* that missing detail (e.g. a ranking question
asking guests to rank candidate dates), surface the winning answer as a one-click suggestion on the event
edit form — instead of requiring the host to read the Table page's recommendation and manually retype it.

This is a small, fully deterministic feature. No LLM/Gemini call and no free-text date parsing are
involved anywhere in this design.

## Non-goals

- No natural-language date/time extraction from free text. Text-type questions never produce an
  autofill value — they are out of scope for a "suggested value" entirely (see Question 2 below).
- No new event fields. No new "location undecided" sentinel (location/venue are already nullable text
  with no value, so absence *is* the TBD state).
- No generic, extensible "field registry" for arbitrary future fields (dress code, theme, etc.). This
  ships for exactly two field groups: event date/time, and venue/location. Extending later is a new,
  small addition to the same module, not a redesign.
- No new surface. The suggestion appears only inline on the existing host Edit Event form — no new
  banner on Event Details.

## Background: what already exists

- **Date/time TBD sentinel** — `lib/event-date.ts` already defines `UNDECIDED_EVENT_DATE =
  '9999-12-31T12:00:00.000Z'` and `isEventDateUndecided(value)`.
- **Location TBD state** — `public.events.venue` and `public.events.address` are both nullable `text`
  columns (`supabase/migrations/20260727000001_initial_schema.sql`) with no sentinel; TBD simply means
  both are empty/null.
- **Custom survey questions** — `lib/questionnaire.ts` defines `CustomQuestionConfig` (`type: 'single' |
  'multiple' | 'ranking' | 'text' | 'slider'`, with `title`, `helperText`, `options`). Questions are
  fully host-authored free text; nothing currently tags a question as "this is about the venue."
- **Stored responses** — `event_questionnaires.config` holds the full `QuestionnaireConfig` JSON;
  `event_question_responses` holds one row per `(question_id, response)` per respondent.
- **Ranking winner logic already exists, but only inline** — `app/(chef)/events/[id]/table/page.tsx`
  (`summarizeCustomAnswers`, lines ~32–75) computes, per ranking question, a Borda score per option
  (N options → 1st place = N points down to 1 point for last, summed across all responses) and sorts
  options descending; for choice questions it tallies raw selection counts and sorts descending. This
  logic is duplicated nowhere else today, but it also isn't exported/reusable — it's a local function
  inside the Table page component. `lib/event-planning.ts` separately has `rankingInsight()`, which turns
  an already-computed `rankings` array into an English sentence for the Gemini planning-advice prompt —
  it does not compute the rankings itself.
- **3-response confidence floor precedent** — the guest-only RSVP readiness feature (see
  `docs/IMPLEMENTATION_STATUS.md`, "Guest-only RSVP readiness") already establishes: fewer than 3
  non-host responses is treated as too little signal to act on.

## Design

### 1. Extract the winner-computation logic (dedup, not new logic)

Move the ranking Borda-score computation and the choice-question tally/sort out of
`app/(chef)/events/[id]/table/page.tsx`'s local `summarizeCustomAnswers` and into `lib/event-planning.ts`
as two standalone, independently testable functions:

```ts
export function rankingWinners(
  question: { options?: { value: string; label: string }[] },
  responses: unknown[] // raw response values for this question_id only
): { label: string; bordaScore: number; firstChoiceVotes: number }[]

export function choiceCounts(
  question: { options?: { value: string; label: string }[] },
  responses: unknown[]
): { label: string; count: number }[]
```

`Table`'s `summarizeCustomAnswers` calls these instead of computing inline. Behavior is unchanged —
this is a pure extraction, verified by Table's existing tests continuing to pass unmodified.

### 2. Keyword classification

New module `lib/event-tbd-suggestions.ts`.

```ts
export type TbdField = 'dateTime' | 'location'

const FIELD_KEYWORDS: Record<TbdField, string[]> = {
  dateTime: ['date', 'day', 'when', 'time', 'schedule', 'weekend', 'evening', 'morning', 'afternoon'],
  location: ['where', 'location', 'venue', 'restaurant', 'address', 'place'],
}
```

`classifyQuestion(question)` scans `question.title` and `question.helperText` (concatenated, lower-cased)
for **whole-word** matches (`\bkeyword\b` regex, not substring — so "day" doesn't match inside "today"
unless "today" itself is separately meaningful; word-boundary matching is applied per keyword) against
each field's keyword list, and returns a score per field: the count of *distinct* keywords matched (not
total occurrences). A question with a score of 0 for a field does not match that field at all.

Only a question's `title`/`helperText` are scanned — never its `options[].label` values, since those are
the candidate answers (e.g. "Saturday Aug 30, 7pm"), not the topic of the question.

Only `ranking`, `single`, and `multiple` question types are classified at all. `text` and `slider`
questions are never classified and never produce a suggestion (per the "Question types" decision below).

### 3. Value derivation

For each TBD field still missing on the event (see §4), among all custom questions whose type is
`ranking`/`single`/`multiple` and whose classification score for that field is > 0:

1. Pick the question with the **highest score** for that field (ties broken by the questionnaire's
   existing `order` field, lower first — i.e. earlier in the survey wins ties).
2. Compute its responses:
   - `ranking` → `rankingWinners()`; winner = top of the sorted list, **provided** there's no exact
     `bordaScore` tie for first place (mirrors `rankingInsight`'s own "no clear favorite" tie handling —
     a tie produces no suggestion for that field rather than an arbitrary pick).
   - `single`/`multiple` → `choiceCounts()`; winner = top of the sorted list, again suppressed on an exact
     tie for the top count.
3. Apply the 3-response floor: if the question's `responseCount` (distinct respondents who answered
   it) is `< 3`, no suggestion is produced for that field, regardless of a clear winner existing.

If no question classifies for a field, or the classified question ties, or is under the response floor,
that field simply gets no suggestion — the edit form renders exactly as it does today for that field.

### 4. Entry point

```ts
export type TbdSuggestion = {
  field: TbdField
  value: string           // the winning option's label, verbatim
  sourceQuestionTitle: string
  responseCount: number
}

export function computeTbdSuggestions(
  event: { event_date: string; venue: string | null; address: string | null },
  questions: CustomQuestionConfig[],
  responseRows: Array<{ question_id: string; response: unknown }>
): TbdSuggestion[]
```

This is the single function the edit page calls. It internally checks `isEventDateUndecided(event.event_date)`
and `!venue?.trim() && !address?.trim()` to decide which of the two fields are even eligible before doing
any classification work, then runs §2–§3 for each eligible field.

### 5. Wiring into the edit page

`app/(host)/host/[id]/edit/page.tsx` currently selects
`host_id,title,tagline,event_date,venue,address,dress_code,custom_details,theme,cover_url` and does not
touch questionnaire data at all. It gains, only when at least one field is TBD (avoiding the extra
queries entirely otherwise):

- A fetch of `event_questionnaires.config` and `event_question_responses` for the event — the same two
  queries Table already runs, run here independently (no shared caching layer; this matches the existing
  pattern where each page fetches what it needs directly via Supabase per the Decision Log's
  call-shared-services-directly preference).
- `computeTbdSuggestions(...)` run once on load, stored in local state.

UI: next to the date/time input, when a `dateTime` suggestion exists, render:

```
Suggested: {value} · from {responseCount} responses to "{sourceQuestionTitle}"   [Use this]
```

Same pattern next to the location input for a `location` suggestion. Clicking **Use this** sets the
corresponding local form field (`dateTime` / `location`) exactly as if the host had typed/picked it
themselves — it does not submit the form and does not touch the database until the host presses the
existing Save action. Dismissing is implicit: editing the field manually, or simply ignoring the
suggestion and saving something else, both work with zero extra code, since it's just a pre-fill of
local state.

If the relevant field is not TBD (already has a real date, or already has a venue/address), no fetch of
questionnaire data happens for that field and nothing renders — existing edit-page behavior for a
fully-set event is completely unchanged.

### Error handling

- Missing/failed questionnaire fetch (e.g. no questionnaire configured for this event, or the query
  errors) → treat as "no suggestions," matching the rest of the page's existing restrained-error pattern
  (e.g. Shared Album's "expose restrained errors without clearing existing photos"). The edit form must
  never fail to render because a suggestion couldn't be computed.
- Malformed/legacy response rows (wrong type for the question's expected shape) are filtered out the
  same way `summarizeCustomAnswers` already does today (`Array.isArray`/`typeof` guards) — no new
  malformed-data handling is needed since this reuses that exact filtering via the extracted functions.

## Testing

- `lib/event-planning.ts`: unit tests for the extracted `rankingWinners()` and `choiceCounts()`, reusing
  existing fixtures from `__tests__/event-planning.test.ts` and confirming `Table`'s own tests still pass
  unmodified after the extraction (proves the refactor is behavior-preserving).
- `lib/event-tbd-suggestions.ts`: unit tests for
  - keyword classification (word-boundary matching, e.g. "day" must not match "today"; multiple keyword
    hits scoring higher than one),
  - highest-score-wins tie-breaking by question `order`,
  - ranking-tie and choice-tie suppression (no suggestion when top two are equal),
  - the 3-response floor (2 responses → no suggestion, 3 → suggestion appears),
  - text/slider questions never producing a suggestion even with matching keywords in their title,
  - a fully-set event (real date, real venue) producing zero suggestions without needing questionnaire
    data at all.
- `__tests__/host-edit-page.test.tsx` (or wherever the edit page's existing tests live): integration test
  asserting the suggestion chip appears for a TBD date with ≥3 ranking responses, is absent below the
  floor, and clicking "Use this" fills the date/time input without submitting the form.

## Acceptance criteria

- A host opening Edit Event for an event with `event_date` still `9999-12-31` and ≥3 responses to a
  clearly date-related ranking question sees a one-click suggestion matching the same winner Table's
  planning recommendations would describe.
- The identical mechanism works for venue/location using single/multiple-choice or ranking questions
  about where to hold the event.
- No suggestion ever appears for a fully-set field, a sub-floor response count, a tied winner, or a
  text/slider question.
- No new Gemini/LLM calls are introduced. No new database columns or migrations are introduced.
- `Table`'s existing ranking/choice summaries are unchanged after the `rankingWinners`/`choiceCounts`
  extraction (existing Table tests pass without modification to their assertions).
