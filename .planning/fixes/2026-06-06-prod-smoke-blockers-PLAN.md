# Fix Plan — Prod Smoke-Test Blockers (first post-launch patch)

**Branch:** `fix/prod-smoke-blockers` off `main` @ `923cae0` (NOT off `phase-2-knowledge-layer`).
**Status:** PLAN — awaiting founder review. No code changed yet.
**Ship path:** branch → implement → `npm run gate` → `/codex` + `/cso` (persist path) → PR → squash-merge → Vercel prod deploy.

Two blockers found in the prod smoke test of the merged Phase-2 build:

- **BLOCKER-1 (persist):** "Save and continue" is a silent no-op → `confirmDraft` never fires → no `memory.confirmed` → no embed → Q&A empty.
- **BLOCKER-2 (nav):** `/app/memory` is the hardcoded 01-09 stub; the real flow lives at `/onboarding/import/paste`; the dashboard CTA + sidebar both point at the stub.

---

## STEP 1 (pre-work) — Pin BLOCKER-1's exact failure ✅ (static analysis done; runtime confirm in T1)

**Root cause is deterministic, not a data edge case** (this confirms **Gate B**, rules out Gate A):

`src/components/memory/confirmation-form.tsx:422-426` wires the form resolver as
```ts
const form = useForm<FormShape>({                       // FormShape = { payload: BusinessMemoryConfirmed }
  resolver: zodResolver(
    businessMemoryConfirmedSchema.transform((v) => ({ payload: v })) as never,
  ) as never,
  defaultValues: { payload: { ...initialDraft, confirmedAt: nowIso() } },
  mode: 'onSubmit',
});
```
- The form **value** is wrapped: `{ payload: {...} }` (`defaultValues.payload`; `form.setValue('payload', buildPayload())` at :749-752).
- `businessMemoryConfirmedSchema` (`business-memory.zod.ts:401`) validates the **unwrapped** object and **requires** two top-level keys: `provenance` (`provenanceSchema`) and `confirmedAt` (`z.iso.datetime()`).
- `.transform((v) => ({ payload: v }))` rewrites the parsed **output**, NOT the shape the parser **expects**. So zodResolver parses the wrapped `{ payload }` against the unwrapped schema → `provenance` and `confirmedAt` are **missing at the top level** → it always errors `provenance: Required` + `confirmedAt: Required`.
- Those are **non-card paths**. `errorCount` only walks `payload.<fieldKey>` over rendered `fields` (:473-481) and the banner needs `errorCount > 0` (:883) → **0 → no banner**. `form.handleSubmit(onValid)` (:739) has **no `onInvalid`** arg → on failure it silently sets `formState.errors` and returns → `onValid` never runs → `onSubmit` → `confirmDraft` never fires → **zero network, zero console** (exactly the DevTools symptom).
- The two `as never` casts (:425-426) suppressed the TS error that would have flagged the shape mismatch.

**`buildPayload()`'s output is itself valid** — it returns a well-formed `BusinessMemoryConfirmed` (draft values + `confirmedAt` + folded provenance). The bug is the **wrapper/resolver shape mismatch**, not the assembled data. (T1 confirms by asserting `businessMemoryConfirmedSchema.safeParse(buildPayload(realDraft)).success === true` and `formState.errors` carries top-level `provenance`/`confirmedAt`.)

**Exact failing fields:** top-level **`provenance`** and **`confirmedAt`** ("Required"), caused by validating the wrapped `{ payload }` value against the unwrapped schema.

---

## Tasks

### T1 — Reproduce + pin (test-first, no prod change)
1. Add a unit test that feeds a **representative ClockPay-shaped draft** through `buildPayload()` and asserts:
   - `businessMemoryConfirmedSchema.safeParse(buildPayload(draft)).success === true` (proves the DATA is valid — the wrapper is the bug).
   - The current resolver (`businessMemoryConfirmedSchema.transform(...)`) applied to `{ payload: buildPayload(draft) }` **fails** with issues at top-level `provenance` + `confirmedAt` (locks the regression).
2. This becomes the red test T2 turns green.

### T2 — BLOCKER-1 fix (the persist path)
**(a) Correct the resolver to the wrapped form shape.** Replace
```ts
zodResolver(businessMemoryConfirmedSchema.transform((v) => ({ payload: v })) as never) as never
```
with a resolver whose **expected input** is the wrapped value:
```ts
zodResolver(z.object({ payload: businessMemoryConfirmedSchema }))
```
Remove the `as never` casts so the types check honestly (the form is `useForm<{ payload: BusinessMemoryConfirmed }>`). This makes `form.handleSubmit` validate the actual form value → `onValid` fires → `onSubmit(buildPayload())` → `confirmDraft` → `memory.confirmed` → embed.

**(b) Never-silent-again: add an `onInvalid` callback + a form-level error surface.**
- Pass `onInvalid` to `form.handleSubmit(onValid, onInvalid)` (:739) that sets a `formError` string + (content-blind) `logger.warn('confirm: validation blocked', { fieldCount })`.
- Render a **form-level error region** (`role="alert"`, new `data-testid="confirmation-form-form-error"`) that fires when there are errors on paths **outside** the rendered cards (i.e., `formState.errors` keys not covered by `errorCount`). Operator-voice copy: e.g. "Trochia couldn't save this Business Memory. Re-confirm each field, or contact support if this persists." NO field content echoed.
- Keep the existing per-card `errorCount` banner for card-level errors.

**(c) Defensive server backstop check (read-only audit, fix only if needed).** Confirm `memoryRouter.confirmDraft` re-validates the payload server-side against `businessMemoryConfirmedSchema` and rejects unresolved provenance arrays (form-bypass guard). If absent, add it — the client gate must not be the only validation.

**Acceptance:** with the resolver fixed, a fully-confirmed draft submits → a single `POST /api/trpc/memory.confirmDraft` (200) → `business_memory.confirmedAt` set → `memory.confirmed` emitted → embed row(s) appear. A deliberately-broken payload shows the new form-level error (not a silent no-op).

### T3 — BLOCKER-2 fix (the nav / `/app/memory` route)
**Design decision for founder (pick in review):** `/app/memory` must serve the REAL Business Memory experience for BOTH a first-time founder (no memory) AND a returning/confirmed founder (memory exists) — not the onboarding-only flow and not the stub.

Proposed minimal-correct shape:
1. Rewrite `src/app/(app)/app/memory/page.tsx` (server component) to read the tenant's row via `memory.getDraft` (server-side), then render a client island:
   - **No row / no confirmed memory** → render the real paste→confirm→save flow (reuse the `paste-flow` + `components/memory/*` pieces).
   - **Confirmed memory exists** → render a **view/edit** state (seed `ConfirmationForm` with the confirmed values, or a read summary with a "Re-import / update" affordance). Minimum viable: show the confirmed memory + allow a re-extract.
2. **Parameterize the onboarding-specific copy/navigation.** `PasteFlow`'s done-state says "Continue to deck upload" and pushes `/onboarding/deck` (:108, :354-356). In the `/app/memory` context that copy/navigation is wrong. Add a prop (e.g. `mode: 'onboarding' | 'app'`) OR factor the shared paste→confirm→save core out of `PasteFlow` so `/app/memory` supplies app-appropriate done copy + stays on `/app/memory`.
3. **Links:** once `/app/memory` is real, the existing links are CORRECT as-is — `empty-dashboard.tsx:15,31` ("Start Business Memory" → `/app/memory`) and `sidebar.tsx:40` (`{ label: 'Business Memory', href: '/app/memory' }`). **No link change needed** if we fix the route (preferred). Do NOT repoint them to `/onboarding/import/paste` — that's the onboarding flow, wrong for returning users. (If the founder prefers the smaller change of repointing links instead of building the route, that leaves returning users with onboarding copy — not recommended.)

**Scope guard:** the dashboard "Coming Phase 4/5" cards and sidebar "Data Room — Phase 7 / Raise Ops — Phase 9" are CORRECT (those phases aren't built) — out of scope. Only Business Memory (Phase 2, shipped) is wrong.

### T4 — Regression guard (the seam that shipped green)
1. **Unit (fast):** the T1 test, kept — drives `buildPayload()` → `businessMemoryConfirmedSchema` → asserts a valid payload submits (the UI↔mutation contract). This is the cheap guard that would have caught BLOCKER-1.
2. **Durable E2E (the real guard):** an **authed Playwright** spec that walks `/onboarding/import/paste` (or `/app/memory`): paste → draft → confirm each field → **Save and continue** → assert (a) a real `memory.confirmDraft` network call returns 200, (b) the done/saved state renders, (c) a follow-up `getDraft`/Q&A shows the memory persisted. This closes the gap: the existing 02-02 Playwright asserted UI state but never drove the payload through the schema + mutation.
3. Note in the spec why it exists (form↔mutation seam, BLOCKER-1).

### T5 — Lessons + follow-ups (docs)
- `tasks/lessons.md`: "Tests were green but the real onboarding flow was broken at the **form↔mutation seam** — no test ever drove the actual assembled form payload through `zodResolver`/`businessMemoryConfirmedSchema` and on to `confirmDraft`. A passing component test that asserts rendered UI ≠ a working submit. Rule: every form that persists via a mutation needs (a) a unit test of `buildPayload → schema` and (b) an authed E2E that asserts the real mutation fires. Beware `as never` casts around `zodResolver` — they hid a form-value-vs-schema shape mismatch."
- Record **MEMORY-NAV-WIRING-01** (still unrecorded): `/app/memory` shipped as the 01-09 stub in merged main; real flow was wired into onboarding only; nav points at the stub. Fixed in T3.
- Confirm **P4.5-POLISH-14** (OAuth redirect) is resolved (Supabase Site URL/Redirect-URLs) — already fixed in prod; mark closed in `tasks/phase-4-5-polish.md`.

### T6 (DEFER — NOT this plan) — FOLLOWUP-EXTRACT-500-RETRY-01
The intermittent `extractFromPaste` 500: the metered path (`costContext`) disables the OpenAI fallback, so a transient structured-output validation miss throws `AI_STRUCTURED_OUTPUT_INVALID` → 500; retry succeeds. Optional bounded retry (e.g. one in-agent re-roll on `AI_STRUCTURED_OUTPUT_INVALID` for the extract path before surfacing 500) — **separate follow-up**, not a launch blocker. Captured in `tasks/lessons.md` follow-ups.

---

## Out of scope / non-goals
- The `withSentryConfig` restore (FOLLOWUP-SENTRY-BUILD-INTEGRATION-RESTORE-01) — separate.
- Streaming Q&A, corpus expansion, the 2 known `FOLLOWUP-HARDCODED-DOMAIN-REGEX-01` test rows — unrelated.
- Any Phase 3+ module UI.

## Files expected to change (review checkpoint)
- `src/components/memory/confirmation-form.tsx` (T2a/b — resolver shape + onInvalid + form-level error)
- `src/app/(app)/app/memory/page.tsx` (T3 — real flow + confirmed-user state)
- possibly `src/app/(app)/onboarding/import/paste/paste-flow.tsx` (T3 — `mode` prop / extract shared core) — **only if** the founder picks "parameterize PasteFlow"
- `src/server/routers/memory.ts` (T2c — server-side confirm validation backstop, only if missing)
- tests: `tests/components/memory/*` (T1/T4 unit), `tests/e2e/*` (T4 authed E2E)
- docs: `tasks/lessons.md`, `tasks/phase-4-5-polish.md`

## Verify-loop (at execute time)
`npm run gate` (typecheck, lint, check:banned, full vitest) → expect prior 2 known domain-regex fails ONLY + the new tests green; `eval:run` PR-sim exit 0; schema-lock; drizzle-kit. Then `/codex` (correctness — touches persist) + `/cso` (data-flow — the confirm payload + embed trigger). Then PR → squash-merge → prod deploy → re-run the smoke test (paste → confirm → save → Q&A returns a cited ClockPay answer).

## Open questions for founder review
1. **T3 shape:** parameterize `PasteFlow` with a `mode` prop, OR factor a shared paste→confirm→save core? (Affects whether `paste-flow.tsx` changes.)
2. **T3 confirmed-user state:** minimal = show confirmed memory + "re-import" affordance, OR full inline edit of the confirmed memory now? (Recommend minimal for the first patch.)
3. **T2c:** want me to add the server-side `confirmDraft` re-validation backstop in THIS patch, or as a fast-follow?
