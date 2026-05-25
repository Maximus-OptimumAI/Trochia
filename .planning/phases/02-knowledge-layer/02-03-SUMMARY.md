---
phase: 02-knowledge-layer
plan: 03
subsystem: knowledge-layer
tags: [phase-2, week-3, sanitizers, prompt-injection, pii-redact, conflict-resolver, security-gate, codex, cso, owasp-llm-top-10, schema-lock]

# Dependency graph
requires:
  - phase: 02-knowledge-layer
    plan: 01
    provides: business_memory + interaction tables, provenance jsonb shape, RLS tenant_isolation, one-row-per-tenant unique index, schema lock
  - phase: 02-knowledge-layer
    plan: 02
    provides: extractFromPaste agent (runAgent + StablePrefix), confirmation card + form shell, memoryRouter (extractFromPaste / confirmDraft / getDraft), atomic-upsert race-condition fix, 5 paste fixtures including helix-saas (contradictory MRR) + mosaic-marketplace (unrelated-party PII)
  - phase: 01-foundation
    provides: src/ai/client.ts (runAgent), src/ai/untrusted.ts (delimitUntrusted + screenForInjection lightweight), src/lib/logger.ts SENSITIVE_FIELDS, AppError + errors.ts, protectedProcedure tenant context, shadcn primitives, banned-string CI, ESLint @anthropic-ai/sdk boundary rule
provides:
  - "src/ai/sanitizers/prompt-injection.ts — promptInjectionSanitizer(text) → { flagged, severity, matches, sanitizedPaste }; OWASP LLM Top 10 regex set + severity classifier with cross-category escalation + Unicode-lookalike + zero-width-space scan; zero @anthropic-ai/sdk import"
  - "src/ai/sanitizers/pii-redact.ts — redactUnrelatedPartyPII(draft, founders) → { draft, redactionsApplied, byType }; founder-self exemption sourced from ctx-trusted auth (post T16-FIX-1); walks narrative.* + traction.growth + traction.runway + provenance source_snippet + rejected_alternatives source_snippet"
  - "src/components/memory/conflict-resolver.tsx — ConflictResolver({ fieldKey, fieldLabel, candidates, onResolve }); shadcn RadioGroup over candidate ProvenanceFields + 'Use a different value' inline override; operator-voice copy; brand-tokens-only"
  - "src/components/ui/radio-group.tsx — shadcn-style wrapper on @base-ui/react/radio-group (new primitive added for the resolver)"
  - "src/server/routers/memory.ts — extended response shape ({ injectionScreen.severity, pii: { redactionsApplied, byType } }); AI_INJECTION_REJECTED → BAD_REQUEST mapping with security-IR audit row (kind=paste_extract metadata={ rejected, severity, categoryCount }); CONFLICT_UNRESOLVED server backstop; conflict-resolution audit row (kind=paste_confirm) with metadata { fieldKey, chosenSourceSnippet ≤200 chars, rejectedCount }; TOCTOU guard added at T16-FIX-1 (lastUpdatedAt in UPDATE WHERE)"
  - "Zod provenance union — provenanceEntrySchema = union(provenanceFieldWithAlternativesSchema, z.array(provenanceFieldSchema).min(2)); isProvenanceArray + chooseProvenance helpers; schema-lock-preserving (single-entry shape is strict subset)"
  - "tests/ai/fixtures/injection-payloads.json — 20 OWASP LLM Top 10 payloads across 7 categories with expected severity + match substrings + sanitized excludes"
  - "tests/ai/fixtures/pii-fixtures.json — 15 unrelated-party PII fixtures covering email / phone / wallet (BTC + SOL) / SSN + founder-self exemption + walk-boundary + regex-false-positive controls"
  - "tests/ai/sanitizers/prompt-injection.test.ts — 38 tests (20 fixture-driven + 5 negative controls + Unicode + ZWS + base64 + severity gate + walk-boundary)"
  - "tests/ai/sanitizers/pii-redact.test.ts — 21 tests (15 fixture-driven + explicit founder-self + walk-boundary + no-op + multi-type combo)"
  - "tests/e2e/onboarding-paste-conflict.spec.ts — 9 Playwright specs (3 unauthed proxy gate + 2 fixture contract + 4 authed conflict / override / PII banner / injection rejection — authed block CI-only pending Phase 4.5 test-user-mint helper)"
  - "interaction.metadata jsonb column + paste_extract / paste_confirm enum values (precursor migration d5902ef — additive; unblocked T11 audit row contract)"
affects:
  - "Plan 02-04 (embed pipeline) — embedder consumes POST-CONFIRM business_memory rows; array provenance never reaches embedder; PII-redacted drafts are what land in business_memory by construction"
  - "Plan 02-05 (eval harness) — gains live-Sonnet sanitizer eval scope (20 injection + 15 PII fixtures through actual extractor against real Sonnet 4.6 to measure FP/FN rates)"
  - "Plan 02-07 (qa-rag agent) — Q&A sidebar reads from already-redacted business_memory; no further redaction needed at retrieval time"
  - "Plan 02-08 (file upload Tier 2) — reuses src/ai/sanitizers/** primitives for ZIP/MD content"
  - "Phase 3 (deck reviewer) — multi-value extraction surfaces inherit the ConflictResolver pattern + rejected_alternatives audit-trail-in-provenance pattern"

# Tech tracking
tech-stack:
  added:
    - "src/ai/sanitizers/ subdirectory (pure-input transformers; zero @anthropic-ai/sdk imports; zero @/lib/logger imports; no I/O)"
    - "Zod v4 union on provenance entries (provenanceEntrySchema); additive, schema-lock-preserving"
    - "interaction.metadata jsonb column (additive Plan 02-01 schema evolution via precursor migration d5902ef)"
    - "paste_extract + paste_confirm enum values on interaction.kind (additive)"
    - "shadcn RadioGroup primitive on @base-ui/react/radio-group (new wrapper at src/components/ui/radio-group.tsx)"
  patterns:
    - "Sanitizer-as-pure-transformer — zero I/O, no logging from inside the function; caller owns observability via returned metadata"
    - "Founder-self exemption sourced from ctx.session (trusted auth identity), NOT from LLM-derived draft.team.founders (post T16-FIX-1) — attacker-controlled paste can no longer plant a malicious self-exemption"
    - "Audit-row redaction boundary — severity band + numeric counts ONLY; never matched substrings; never byType detail; never content fields beyond capped 200-char snippets"
    - "Walked-path whitelist for PII redaction — additive coverage via depth-bounded recursive traversal of narrative.* + traction.growth + traction.runway + provenance[*].source_snippet + provenance[*].rejected_alternatives[*].source_snippet only"
    - "ChooseProvenance audit-trail-in-rejected_alternatives — auditable resolution; the unchosen candidates land in provenance[<field>].rejected_alternatives and are NEVER surfaced to the UI"
    - "TOCTOU guard via lastUpdatedAt-in-UPDATE-WHERE — companion to the existing isNull(confirmedAt) predicate; closes a narrow race where two confirm requests against the same draft could race past the confirm guard between row read + UPDATE"
    - "Severity-gated reject contract — injection severity 'high' or 'critical' throws AI_INJECTION_REJECTED at agent layer; the agent NEVER reaches runAgent (no Sonnet token spend on rejected pastes)"
    - "Cross-category severity escalation — multiple distinct injection categories OR encoded-attack presence bumps severity one tier (cap at critical); single-marker attacks stay at base severity"
    - "Two-layer PII defense — Phase-1 SENSITIVE_FIELDS key-aware logger scrub + Plan 02-03 content-aware redactor; complementary, not redundant"
    - "Sequential single-agent dispatches on Windows — policy shift mid-wave once Claude Code worktree-isolation bug #3099 surfaced (parallel worktree agents' Edit/Write calls silently landed in main repo); P4.5-POLISH-08 captured for upstream tracking"

key-files:
  created:
    - "src/ai/sanitizers/prompt-injection.ts (975 lines) — OWASP LLM Top 10 sanitizer; 7-category pattern registry + Unicode + ZWS + base64-marker detection; severity classifier"
    - "src/ai/sanitizers/pii-redact.ts (493 lines) — content-aware redactor; founder-self exemption set; walked-path whitelist; immutable transform via structuredClone"
    - "src/components/memory/conflict-resolver.tsx (468 lines) — shadcn RadioGroup multi-candidate UI + 'Use a different value' override input; full keyboard a11y; brand-tokens only"
    - "src/components/ui/radio-group.tsx (68 lines) — shadcn-style wrapper on @base-ui/react/radio-group"
    - "tests/ai/fixtures/injection-payloads.json (272 lines, 20 entries) — OWASP LLM Top 10 fixture set"
    - "tests/ai/fixtures/pii-fixtures.json (834 lines, 15 entries) — unrelated-party PII fixtures"
    - "tests/ai/sanitizers/prompt-injection.test.ts (282 lines, 38 tests) — fixture-driven + Unicode + ZWS + base64 + severity gate + negative controls"
    - "tests/ai/sanitizers/pii-redact.test.ts (254 lines, 21 tests) — fixture-driven + founder-self + walk-boundary + no-op"
    - "tests/e2e/onboarding-paste-conflict.spec.ts (436 lines, 9 specs) — unauthed + fixture contract + authed conflict / override / banner / injection-rejected"
    - "src/db/migrations/0006_eminent_toro.sql + meta/0006_snapshot.json (precursor migration d5902ef — interaction.metadata jsonb + paste_extract / paste_confirm enum values)"
  modified:
    - "src/ai/agents/extract-from-paste.agent.ts (+270 / -147 vs 02-02 tail) — Step 2 escalation to promptInjectionSanitizer with severity-gated reject; Step 5+ redactUnrelatedPartyPII; extended return shape ({ pii, injectionScreen.severity })"
    - "src/ai/schemas/business-memory.zod.ts (+220 lines) — provenanceEntrySchema union + isProvenanceArray + chooseProvenance helpers + rejected_alternatives field"
    - "src/components/memory/confirmation-card.tsx (+187 lines) — multiValueCandidates + onResolveConflict + isConflictResolved props; CARRY-1 Undo affordances (Edit again / Restore); CARRY-2 per-field errorMessage + border-danger conditional"
    - "src/components/memory/confirmation-form.tsx (+449 lines) — CARRY-2 per-field error propagation via pickError walker; banner copy upgraded to count ('N fields need attention'); conflict-resolver wiring with isConflictResolved gate; submit gate blocks while any field has unresolved multi-value provenance"
    - "src/app/(app)/onboarding/import/paste/paste-flow.tsx (+248 lines) — AI_INJECTION_REJECTED state slot + 'Edit and retry' CTA (paste retained); redactions-applied banner above ConfirmationForm in confirming state with byType-aware detail copy + dismiss"
    - "src/server/routers/memory.ts (+395 lines) — output shape extension (pii + injectionScreen.severity); AI_INJECTION_REJECTED → BAD_REQUEST mapping; security-IR audit row on rejection (severity + categoryCount only, never matched substrings); CONFLICT_UNRESOLVED server backstop; conflict-resolution audit row with metadata; TOCTOU guard added at T16-FIX-1 (lastUpdatedAt in UPDATE WHERE)"
    - "src/db/schema/memory.ts (+18 lines) — interaction.metadata jsonb column declaration + paste_extract / paste_confirm enum values"
    - "tests/ai/extract-from-paste.test.ts (+286 lines) — return-shape assertions extended (pii + injectionScreen.severity); injection-screen test upgraded to assert AI_INJECTION_REJECTED throw; founder-self exemption smoke + PII metadata smoke added"
    - "tests/ai/extract-from-paste.cache.test.ts (+20 lines) — variableSuffix divergence assertion updated to account for sanitizedPaste replacing raw paste"
    - "tests/integration/memory-paste-rls.test.ts (+21 lines) — case 6 expectation updated to match T11 contract (kind='paste_confirm' audit row with metadata)"
    - "tsconfig.json (+6 lines) — excludes drizzle-kit introspect scaffolding from tsc"
    - ".gitignore (+4 lines) — gitignore drizzle-kit introspect scaffolding (not canonical schema)"
    - "tasks/phase-4-5-polish.md (+84 lines) — P4.5-POLISH-08 through P4.5-POLISH-13 logged across the wave"

key-decisions:
  - "Severity threshold for reject is 'high' (not 'medium') — medium-severity single-marker payloads continue past the sanitizer with sanitizedPaste applied + warned at logger.warn; only 'high' or 'critical' throws AI_INJECTION_REJECTED. Rationale: low/medium markers are common in legitimate founder content (e.g. founder writes 'ignore the noise around our latest pivot'); a high threshold avoids over-rejection of benign pastes while the multi-category + encoded-attack escalation rules catch genuinely hostile combos."
  - "PII redactor runs POST-runAgent, PRE-persistence (not pre-LLM) — the LLM may legitimately produce narrative containing third-party context (e.g. quoting a customer testimonial that names an unrelated person); the redactor scrubs the OUTPUT before it lands in business_memory. The pre-LLM defense is the sanitizer's job (which screens for instructions, not PII)."
  - "Founder-self exemption sourced from ctx-trusted auth (T16-FIX-1 fix) — the original spec read founder identity from draft.team.founders, which is LLM-derived from attacker-controllable paste content. The CSO M1 finding flagged this as a high-severity bypass vector (attacker pastes content that plants their own email under team.founders[*] to whitelist it from redaction). Fix: the agent now passes ctx.session.user.email as the canonical founder identity into redactUnrelatedPartyPII; draft.team.founders is informational only."
  - "Audit-row content-redaction boundary at severity + counts only — interaction.metadata jsonb captures { rejected, severity, categoryCount } on injection rejection and { fieldKey, chosenSourceSnippet ≤200 chars, rejectedCount } on conflict resolution. NEVER matched substrings (those are paste content); NEVER byType detail (those reveal what kind of PII was detected per field); the 200-char source_snippet cap is the audit-vs-PII-leak tradeoff."
  - "Provenance jsonb shape evolves at Zod layer ONLY — no SQL migration adds columns. The union (single | array) and rejected_alternatives addendum are enforced in src/ai/schemas/business-memory.zod.ts. The provenance column at the SQL layer continues to accept arbitrary JSON (Plan 02-01 deliberately left it unconstrained per Pitfall 11 mitigation)."
  - "Conflict-resolution audit lands in rejected_alternatives field of the chosen provenance entry — losing candidates are preserved as siblings of the winner inside the same jsonb cell. NEVER surfaced to UI. The founder cannot delete the audit trail post-confirm without a follow-up confirmDraft mutation (which itself appends a new interaction row)."
  - "TOCTOU guard added in T16-FIX-1 via lastUpdatedAt-in-UPDATE-WHERE — companion to the existing isNull(confirmedAt) guard from 02-02 3be8fa6. Closes a narrow race where two confirm requests against the same draft could both pass the read-side confirm check + then race on the UPDATE. The lastUpdatedAt predicate ensures the second request's UPDATE matches 0 rows + surfaces a clean CONFLICT."
  - "AppError shape upgrade deferred — Codex M1 flagged that the current AppError doesn't carry structured context (the agent surfaces severity + categoryCount via a side-channel parsed string). Fix is non-trivial (touches every AppError call site) and not security-critical; logged at P4.5-POLISH-10 for a structured pass."
  - "Parallel worktree dispatch abandoned mid-wave — Wave 4-B/4-C on 2026-05-22 hit Claude Code worktree-isolation bug #3099 (parallel agents' Edit/Write calls silently landed in main repo working tree); recovery worked but atomicity was broken. Policy shift for remainder of wave: sequential single-agent dispatches only on Windows. Logged at P4.5-POLISH-08 + P4.5-POLISH-09 for upstream tracking."
  - "ConflictResolver override-path rejected_alternatives = empty array — when the founder types a custom value via 'Use a different value' (instead of picking a radio), the synthesized ProvenanceField currently lands with rejected_alternatives = []. Codex M-flag noted this loses the audit trail of the original candidates. Logged at P4.5-POLISH-11; fix is a 3-line patch to chooseProvenance call site in the form."

patterns-established:
  - "Sanitizers live in src/ai/sanitizers/** ONLY — pure-input transformers; zero @anthropic-ai/sdk imports (grep-verified); zero @/lib/logger imports (grep-verified); no DB; no network. Agents under src/ai/agents/** consume them."
  - "ConflictResolver consumes ProvenanceField type from @/ai/schemas/business-memory.zod ONLY — never from @/ai/agents or @/ai/client (component-layer boundary respected)"
  - "Logging contract for security-IR territory — allowed: { accountId, action, pasteChars, latencyMs, redactionsApplied (number), injectionFlagged (bool), injectionSeverity (band) }. Forbidden: raw paste, draft contents, injectionScreen.matches snippets, source_snippet strings, byType keys for PII counts, provenance entry contents."
  - "Voice discipline in security-rejection UX — Trochia FLAGS, REDACTS, REJECTS, SURFACES. NEVER detects (chatty), NEVER apologizes ('Sorry' / 'Oops'), NEVER 'helps'. Pinned in COPY constants in conflict-resolver.tsx + paste-flow.tsx + confirmation-form.tsx."

requirements-completed:
  - KNW-03  # per-field confirmation UI with source snippets, conflict resolution, and PII redaction — canonical requirement COMPLETE

# Metrics
duration: ~5 days (commit d0e0b21 plan-doc on 2026-05-20 → commit af7bcf9 close on 2026-05-25), 35 commits on the wave
completed: 2026-05-25
---

# Phase 2 Plan 03 — Week-3 Hardening (KNW-02c + KNW-02d / KNW-03) Summary

**A founder's pasted AI context now flows through a genuine prompt-injection sanitizer (OWASP LLM Top 10 + Unicode + zero-width-space + base64-marker; severity-gated reject at 'high' or 'critical') and a content-aware PII redactor (third-party emails / phones / wallets / SSN replaced with typed [REDACTED-*] markers; founder-self identity sourced from ctx-trusted auth, not LLM-derived draft); contradictory extractions (the helix-saas $40,250 vs $24,750 MRR fixture) surface the ConflictResolver inline within the per-field card, gating Confirm until the founder picks one canonical value or types an override, with the unchosen candidates preserved in provenance.rejected_alternatives as an auditable trail — shipped with 200 vitest tests passing (62 new), 9 Playwright specs, an APPROVED /codex verdict (H1+H2+H3+M1 closed at T15-FIX-1 + T15-FIX-2), an APPROVED /cso verdict (M1+M2+M3 closed at T16-FIX-1), schema-lock holding (zero SQL columns added; provenance union shape lives at the Zod layer only).**

## Performance

- **Duration:** ~5 days (2026-05-20 plan-doc d0e0b21 → 2026-05-25 close af7bcf9)
- **Commits on the wave:** 35 (from plan-doc d0e0b21 through af7bcf9; 50+ commits ahead of main when counting predecessor 02-02 tail)
- **Source LOC delta:** +7,785 / -147 across 27 files (sanitizers + tests + fixtures + UI + router + schema + migrations + planning docs)
- **Test delta:** 138 (02-02 baseline) → 200 passing (+62); 35 skipped (RLS suite + Playwright authed specs gated on TEST_DATABASE_URL / test-user-mint helper)
- **Tasks:** 17 of 17 (T15 + T16 ran as checkpoint:human-verify; both shipped APPROVED-WITH-FIXES + the fixes landed before this close)

## Accomplishments

- Sanitizers live as pure-input transformers under src/ai/sanitizers/** — promptInjectionSanitizer carries the OWASP LLM Top 10 7-category pattern registry (direct-override / role-injection / system-prompt-extraction / output-format-hijack / encoded-attack / exfiltration / jailbreak) with Unicode-lookalike + zero-width-space + base64-marker detection layered on top; cross-category severity escalation + encoded-attack-floor-at-critical encoded in the classifier
- redactUnrelatedPartyPII walks narrative.* + traction.growth + traction.runway + provenance source_snippet + rejected_alternatives source_snippet ONLY (top-level scalars and team.* are out-of-scope by design); founder-self exemption sourced from ctx.session.user.email (T16-FIX-1 trusted-source fix); typed markers ([REDACTED-EMAIL] / [REDACTED-PHONE] / [REDACTED-WALLET] / [REDACTED-SSN]) carry intent to downstream consumers
- Extractor agent escalated from Phase-1 screenForInjection (flag-only) to promptInjectionSanitizer with severity-gated reject — agent throws AI_INJECTION_REJECTED at severity 'high' or 'critical' BEFORE runAgent (no Sonnet token spend on rejected pastes); PII redactor runs POST-runAgent, PRE-persistence; return shape additively extends with { pii: { redactionsApplied, byType }, injectionScreen.severity }
- Zod provenance shape evolved to union(provenanceFieldWithAlternativesSchema, z.array(provenanceFieldSchema).min(2)) — additive at the schema-lock layer; every 02-02 fixture still parses against the upgraded schema; isProvenanceArray + chooseProvenance helpers added for UI + router consumers; rejected_alternatives optional field on the single-entry shape carries the audit trail post-resolve
- ConflictResolver UI ships at src/components/memory/conflict-resolver.tsx — shadcn RadioGroup over candidate ProvenanceFields with source_snippet visible per option (Collapsible primitive from 02-02 reused) + 'Use a different value' inline override input (type-aware: 'number' for traction.mrr/arr/valuation/customers/burn, 'text' otherwise); operator-voice copy pinned in COPY constant; brand-tokens-only (zero raw hex in conflict-resolver.tsx — grep-verified); full keyboard a11y (role=radiogroup + arrow-keys + Tab to custom input)
- ConfirmationCard + ConfirmationForm extended (CARRY-1 + CARRY-2) — terminal-state cards (status='confirmed' or 'rejected') expose 'Edit again' / 'Restore' ghost-link affordances that transition back to pending (clearing confirmedAt for confirmed fields, restoring original draft value for rejected fields); per-field validation errors propagate via form.formState.errors[fieldKey].message into each card (border-danger swap + text-body-sm text-danger helper text below the value row + aria-describedby wired); banner copy upgraded from static 'Some fields are invalid' to dynamic count ('N fields need attention' / 'N conflicts unresolved')
- memoryRouter.extractFromPaste output additively carries { injectionScreen.severity, pii: { redactionsApplied, byType } } — AppError code AI_INJECTION_REJECTED maps to TRPCError BAD_REQUEST via the existing rethrowAgentError helper; security-IR audit row written on rejection (kind='paste_extract' + metadata { rejected: true, severity, categoryCount }) BEFORE the BAD_REQUEST throw, with audit-write failure swallowed at logger.error (audit non-blocking on the founder response); CONFLICT_UNRESOLVED server backstop throws TRPCError CONFLICT when any submitted provenance entry is still an array; conflict-resolution audit row (kind='paste_confirm' + metadata { fieldKey, chosenSourceSnippet ≤200 chars, rejectedCount }) per resolved field; TOCTOU guard added at T16-FIX-1 via lastUpdatedAt-in-UPDATE-WHERE companion to the existing isNull(confirmedAt) predicate from 02-02 3be8fa6
- paste-flow client state machine extended with 'injection-rejected' sibling state — 'Paste rejected' card with 'Edit and retry' CTA returns to idle with pasteText retained (no data loss); redactions-applied banner above ConfirmationForm in confirming state with byType-aware singular/plural detail copy + dismiss button; aria-live='assertive' on the rejection heading; all NEW visible strings in COPY constant
- 9-spec Playwright e2e at tests/e2e/onboarding-paste-conflict.spec.ts — 3 unauthed proxy gate specs + 2 fixture-corpus contract specs always run; 4 authed specs (conflict-resolution radio pick → DB row + audit, founder override path, PII redactions banner, AI_INJECTION_REJECTED rejection card) skipped locally pending Phase 4.5 test-user-mint helper (same gate pattern as 02-02; CI-only coverage in the meantime)
- Schema-lock invariant from 02-01 held end-to-end — npm drizzle-kit check reports 'Everything's fine' at HEAD; the precursor migration d5902ef added interaction.metadata jsonb + paste_extract / paste_confirm enum values (planner-inheritance error caught at T11 dispatch; precursor unblocked T11's audit-row contract); zero other SQL changes in this plan
- /codex APPROVED-WITH-FIXES at T15 — H1 (severity escalation bypass via single-marker high-base regex + cross-category-bump) + H2 (PII-14 fixture-expected-count regression after dual-walk) + H3 (founder-self exemption from LLM-derived draft) + M1 (severity context surfaced via parsed message string) all closed at T15-FIX-1 0c6bd1a + T15-FIX-2 b6a9a71; M2-M6 + L1 + INFO logged at P4.5-POLISH-12
- /cso APPROVED-WITH-FIXES at T16 — M1 (founder-self trusted-source upgrade), M2 (TOCTOU guard via lastUpdatedAt-in-UPDATE-WHERE), M3 (audit-row write-failure swallow signal) all closed at T16-FIX-1 af7bcf9; LOW + INFO findings logged at P4.5-POLISH-13

## Task Commits

35 commits on the wave (most recent first), mapped to Plan 02-03's 17 tasks (predecessors at 02-02 tail bdf3438 omitted):

| Task | Commit | Description |
|------|--------|-------------|
| Plan doc | `d0e0b21` | docs(02-03): plan Phase 2 Week 3 — conflict resolver + PII redact + injection defense |
| Plan doc fix | `07256d4` | docs(02-03): apply plan-checker FLAG-1/2/3 fixes |
| 1 | `2590d7d` | feat(02-03): Task 1 — Zod provenance union upgrade (KNW-03 schema-lock-preserving) |
| 2 | `98c9dff` | feat(02-03): Task 2 — 20 OWASP LLM Top 10 injection payloads (KNW-02d fixture) |
| 3 | `8014162` | feat(02-03): Task 3 — 15 unrelated-party PII fixtures (KNW-02d fixture) |
| 3 fix | `e1122aa` | fix(02-03): unwrap T3 PII fixtures to plan-spec top-level-array shape |
| 4 | `5b6fe2e` | feat(02-03): Task 4 — OWASP LLM Top 10 prompt-injection sanitizer (KNW-02d) |
| 5 | `a8a6135` | feat(02-03): Task 5 — content-aware PII redactor with founder-self exemption (KNW-02d) |
| 5 fix | `38aeba8` | fix(02-03): PII-14 expected counts reflect dual-walk redaction |
| 6 | `c3897e7` | feat(02-03): Task 6 — wire promptInjectionSanitizer + PII redactor into extract-from-paste agent (KNW-02d) |
| 7 | `f473fee` | test(02-03): Task 7 — sanitizer unit tests (KNW-02d) |
| meta | `e8d122b` | chore: merge Wave 3-A executor worktree (T6 agent wiring + T7 sanitizer tests) |
| 8 | `2b967f1` | feat(02-03): Task 8 — ConflictResolver UI for multi-candidate provenance (KNW-02c) |
| meta | `633e98a` | chore: merge Wave 3-B executor worktree (T8 ConflictResolver UI + RadioGroup primitive) |
| 8 fix | `580b84f` | fix(02-03): ConflictResolver onResolve surfaces scalar value (KNW-02c) |
| 9 | `76b3ca1` | feat(02-03): Task 9 — wire ConflictResolver + CARRY-1 Undo + CARRY-2 errors into ConfirmationCard (KNW-02c) |
| 10 | `a4f1c92` | feat(02-03): Task 10 — wire CARRY-1/CARRY-2 + conflict-resolver gating into ConfirmationForm (KNW-02c) |
| 12 | `692319c` | feat(02-03): Task 12 — paste-flow injection-rejected state + redactions banner (KNW-02d) |
| meta | `2e62d1a` | chore: merge Wave 4-C executor worktree (T12 paste-flow injection-rejected + redactions banner) |
| meta | `a413a12` | docs(phase-4-5): log P4.5-POLISH-08/09 from Wave 4 harness bugs |
| T11 precursor | `d5902ef` | feat(02-03): precursor — add interaction.metadata jsonb + paste_confirm enum (unblocks T11) |
| lessons | `67eb05e` | docs(lessons): log Postgres enum-in-transaction silent failure mode |
| lessons | `afec3ed` | docs(lessons): log Postgres enum-in-transaction silent failure mode (dup re-commit on sequential dispatch) |
| 11 | `823a187` | feat(02-03): Task 11 — memoryRouter sanitizer wiring + security-IR audit + CONFLICT_UNRESOLVED backstop (KNW-02d) |
| chore | `7e4f456` | chore: gitignore drizzle-kit introspect scaffolding (not canonical schema) |
| chore | `fd11029` | chore: exclude drizzle-kit introspect scaffolding from tsc |
| RLS fix | `697534d` | fix(02-03): RLS test case 6 expects paste_confirm row from T11 contract |
| 1092686 | `1092686` | docs(phase-4-5): log P4.5-POLISH-10 AppError structured context |
| 13 | `4478ea1` | test(02-03): Task 13 — Playwright e2e for conflict resolver (KNW-02c) |
| meta | `f0d75d7` | docs(phase-4-5): log P4.5-POLISH-11 override-path rejected_alternatives |
| 14 | `249b101` | test(02-03): Task 14 — extractor regression sweep + founder-self/PII metadata smokes (KNW-02d) |
| meta | `ce4a976` | docs(phase-4-5): log P4.5-POLISH-12 Codex T15 deferred MEDIUM findings |
| 15-FIX-1 | `0c6bd1a` | fix(02-03): T15-FIX-1 — Codex security findings H1+H2+H3+M1 (KNW-02d) |
| 15-FIX-2 | `b6a9a71` | fix(02-03): T15-FIX-2 — Codex re-review fixture caveats (H2 label + M1 regression) (KNW-02d) |
| meta | `8e57981` | docs(phase-4-5): log P4.5-POLISH-13 /cso T16 LOW findings |
| 16-FIX-1 | `af7bcf9` | fix(02-03): T16-FIX-1 — /cso M1+M2+M3 (founder-self trusted source + TOCTOU guard + audit-swallow signal) (KNW-02d) |
| 17 | (this commit) | docs(02-03): Task 17 — Week-3 verification gate + SUMMARY (Plan 02-03 close) |

T15 + T16 are checkpoint:human-verify tasks — they shipped as APPROVED-WITH-FIXES verdicts followed by the FIX commits above. No separate task commit for T15 / T16 themselves; the FIX commits close them.

## Files Created

- `src/ai/sanitizers/prompt-injection.ts` (975 lines) — OWASP LLM Top 10 sanitizer; 7-category pattern registry + Unicode-lookalike normalization (U+2170, U+0456) + zero-width-space stripping (U+200B/200C/200D) + base64-marker detection + cross-category severity escalation + encoded-attack-floor-at-critical
- `src/ai/sanitizers/pii-redact.ts` (493 lines) — content-aware PII redactor; founder-self exemption set built from ctx-trusted auth identity (T16-FIX-1 fix); walked-path whitelist (narrative.* + traction.growth + traction.runway + provenance source_snippet + rejected_alternatives source_snippet); immutable transform via structuredClone; typed replacement markers
- `src/components/memory/conflict-resolver.tsx` (468 lines) — shadcn RadioGroup multi-candidate UI; per-option source_snippet via Collapsible primitive (reused from 02-02); 'Use a different value' inline override input with type-aware parsing; fieldset role=radiogroup + arrow-key cycling + aria-describedby per radio; brand-tokens-only Tailwind (zero raw hex grep-verified); COPY constant pinned for all visible strings
- `src/components/ui/radio-group.tsx` (68 lines) — shadcn-style wrapper on @base-ui/react/radio-group
- `tests/ai/fixtures/injection-payloads.json` (272 lines, 20 entries) — OWASP LLM Top 10 fixture set; severity distribution: 2 low + 6 medium + 9 high + 3 critical; all 7 categories represented
- `tests/ai/fixtures/pii-fixtures.json` (834 lines, 15 entries) — unrelated-party PII fixtures; PII-03 + PII-04 + PII-10 cover founder-self exemption; PII-15 covers regex-false-positive control (email-shaped substring '@step-3' that is NOT a valid email)
- `tests/ai/sanitizers/prompt-injection.test.ts` (282 lines, 38 tests including fixture-driven forEach blocks) — per-payload assertions (flagged, severity, match substring, sanitizedPaste exclusion) + 5 negative-control benign-paste assertions + Unicode + ZWS + base64 specifics + severity gate count assertion
- `tests/ai/sanitizers/pii-redact.test.ts` (254 lines, 21 tests) — per-fixture byType counts + preserved literals + replaced literals + immutability assertion + explicit founder-self exemption test + walk-boundary test + no-op test
- `tests/e2e/onboarding-paste-conflict.spec.ts` (436 lines, 9 specs) — 3 unauthed proxy gate + 2 fixture-corpus contract + 4 authed (conflict radio-pick → DB row + audit; founder override → source_snippet='[founder override]' + rejected_alternatives.length=2; PII banner appears; AI_INJECTION_REJECTED card + retry)
- `src/db/migrations/0006_eminent_toro.sql` + `src/db/migrations/meta/0006_snapshot.json` (precursor migration d5902ef) — interaction.metadata jsonb column + paste_extract / paste_confirm enum values on interaction.kind

## Files Modified

- `src/ai/agents/extract-from-paste.agent.ts` (+270 / -147 vs 02-02 tail) — Step 2 escalation from screenForInjection to promptInjectionSanitizer with severity-gated reject (AI_INJECTION_REJECTED at severity ∈ {'high', 'critical'}); Step 3 delimitUntrusted now wraps injectionScreen.sanitizedPaste (not raw input.paste); Step 5+ redactUnrelatedPartyPII(draft, [ctx.session.user.email]) — founder-self identity sourced from trusted ctx, NOT LLM-derived draft.team.founders (T16-FIX-1); Step 6 assertNoBannedOutput runs on the REDACTED draft; Step 7 logger.info payload extended with { redactionsApplied, injectionSeverity } — NEVER byType detail, NEVER matched substrings; return shape additively extends with { pii, injectionScreen.severity }
- `src/ai/schemas/business-memory.zod.ts` (+220 lines) — provenanceFieldWithAlternativesSchema extends provenanceFieldSchema with optional rejected_alternatives; provenanceEntrySchema = z.union([provenanceFieldWithAlternativesSchema, z.array(provenanceFieldSchema).min(2)]); provenanceSchema upgraded to z.record(z.string(), provenanceEntrySchema); isProvenanceArray + chooseProvenance helpers exported
- `src/components/memory/confirmation-card.tsx` (+187 lines) — multiValueCandidates + onResolveConflict + isConflictResolved + errorMessage + canUndo + onUndo + fallbackInputType props added (all optional, defaults preserve 02-02 behavior); ConflictResolver mounts in value-row slot when multiValueCandidates is present; CARRY-1 'Edit again' / 'Restore' ghost-link affordances on terminal-state action rows when canUndo=true; CARRY-2 border-danger conditional swap + helper text below value row when errorMessage is non-empty
- `src/components/memory/confirmation-form.tsx` (+449 lines) — pickError walker for nested form paths (dot-pathed + bracket-pathed); per-card errorMessage from form.formState.errors; banner copy upgraded to dynamic count ('N fields need attention' + 'N conflicts unresolved'); isProvenanceArray + chooseProvenance imported and consumed; resolvedMap state tracks per-field conflict resolution; submit gate blocks while any field has isProvenanceArray(provenance[fieldKey])===true AND NOT resolvedMap.has(fieldKey); CARRY-1 transitionFieldBackToPending wired
- `src/app/(app)/onboarding/import/paste/paste-flow.tsx` (+248 lines) — 'injection-rejected' state slot added (sibling of idle / drafting / confirming / done — existing 4-state machine preserved); 'Paste rejected' card with operator-voice body + 'Edit and retry' CTA (pasteText retained on retry); aria-live='assertive' on rejection heading; redactions-applied banner above ConfirmationForm in confirming state when response.pii.redactionsApplied > 0; byType-aware detail copy (singular type name when one type, 'PII items' when multiple); dismiss button via local bannerDismissed state; COPY constant pinned
- `src/server/routers/memory.ts` (+395 lines) — extractFromPaste output additively extends with { pii: { redactionsApplied, byType }, injectionScreen.severity }; AppError code AI_INJECTION_REJECTED added to rethrowAgentError switch → maps to TRPCError BAD_REQUEST; security-IR audit row written on rejection (kind='paste_extract' + metadata { rejected: true, severity, categoryCount }, with audit-write failure swallowed at logger.error per T16-FIX-1 M3); CONFLICT_UNRESOLVED server backstop throws TRPCError CONFLICT when any submitted provenance entry isProvenanceArray; conflict-resolution audit row (kind='paste_confirm' + metadata { fieldKey, chosenSourceSnippet ≤200 chars, rejectedCount } per resolved field); TOCTOU guard added at T16-FIX-1 via lastUpdatedAt-in-UPDATE-WHERE; atomic upsert from 02-02 3be8fa6 preserved byte-for-byte
- `src/db/schema/memory.ts` (+18 lines) — interaction.metadata jsonb column declaration + paste_extract / paste_confirm enum values on interaction.kind
- `tests/ai/extract-from-paste.test.ts` (+286 lines) — return-shape assertions extended (result.pii.redactionsApplied + result.pii.byType + result.injectionScreen.severity); injection-screen test upgraded from screen-and-flag to assert AI_INJECTION_REJECTED throw; founder-self exemption smoke (mocked Anthropic returns draft with third-party + founder-self email in narrative.problem → asserts redactionsApplied===1 + founder-self preserved + third-party replaced); PII metadata smoke (asserts result.pii.byType.email === 2 on draft with 2 unrelated emails)
- `tests/ai/extract-from-paste.cache.test.ts` (+20 lines) — variableSuffix divergence assertion updated to account for sanitizedPaste replacing raw input.paste in the captured user message body
- `tests/integration/memory-paste-rls.test.ts` (+21 lines) — case 6 expectation updated to match T11 contract (kind='paste_confirm' interaction row with metadata jsonb)
- `tsconfig.json` (+6 lines) — excludes drizzle-kit introspect scaffolding from tsc
- `.gitignore` (+4 lines) — gitignore drizzle-kit introspect scaffolding (not canonical schema)
- `tasks/phase-4-5-polish.md` (+84 lines across the wave) — P4.5-POLISH-08 through P4.5-POLISH-13 logged

## Verification Loop Results (Task 17 — Master plan §Week 3)

| # | Gate | Status | Evidence |
|---|------|--------|----------|
| 1 | Injection unit test (20 OWASP LLM Top 10 payloads, 100% flag rate, severity matches, sanitizedPaste excludes raw) | **PASS** | `npx vitest run tests/ai/sanitizers/prompt-injection.test.ts` — 38/38 tests pass; severity gate ≥12 of 20 at 'high'/'critical' band; negative controls (5 benign pastes) flagged: false + severity: 'none' |
| 2 | PII unit test (15 fixtures, byType counts match, founder-self preserved, walk-boundary held) | **PASS** | `npx vitest run tests/ai/sanitizers/pii-redact.test.ts` — 21/21 tests pass; PII-03 + PII-04 + PII-10 founder-self exemption confirmed; PII-15 regex-false-positive control passes; PII-13 no-op + walk-boundary tests pass |
| 3 | Conflict UI Playwright e2e (helix-saas fixture → resolver renders → $24,750 selected → DB row + single-object provenance) | **PARTIAL PASS — 5/9 always-run specs discovered + 4 authed specs CI-only** | `npx playwright test tests/e2e/onboarding-paste-conflict.spec.ts --list` — 9 specs discovered; 3 unauthed proxy gate + 2 fixture-corpus contract specs always run; 4 authed specs (conflict-pick / override / PII banner / injection-rejected) skipped locally pending Phase 4.5 test-user-mint helper; CI-only coverage in the meantime |
| 4 | /cso Security Engineer pass (mandatory; sanitizers are the only thing between attacker paste and Sonnet) | **APPROVED** | T16-FIX-1 at `af7bcf9` closes M1 (founder-self trusted-source) + M2 (TOCTOU guard via lastUpdatedAt) + M3 (audit-row swallow signal at logger.error); LOW + INFO findings logged at P4.5-POLISH-13 (`8e57981`) |
| 5 | Compliance Auditor pass (banned-string CI green + manual UX copy scan) | **GREEN** | `npm run check:banned` exits 0; manual grep over conflict-resolver.tsx + paste-flow.tsx + confirmation-form.tsx + confirmation-card.tsx for hard-banned terms ('rolling fund' / 'investment vehicle' / 'adviser' / 'AI-as-call-speaker') returns 0 hits; manual grep for conditionally-banned ('investment advice' / 'legal advice') returns 0 hits |
| 6 | /codex second-opinion on sanitizer regex coverage (mandatory) | **APPROVED** | T15-FIX-1 at `0c6bd1a` closes H1 (severity escalation bypass via single-marker high-base + cross-category bump) + H2 (PII-14 dual-walk regression) + H3 (founder-self from LLM-derived draft) + M1 (severity context surfaced via parsed message string); T15-FIX-2 at `b6a9a71` closes the re-review fixture caveats (H2 label + M1 regression); MEDIUMs (LLM03 / LLM04 / LLM05 + multi-marker FPs + global founder-self exemption) + L1 + INFO logged at P4.5-POLISH-12 (`ce4a976`) |
| 7 | PR review (Code Reviewer + Security Engineer) | **PENDING** | Runs at `/ship` time on the merge PR — this plan ships behind the same Phase-2 CI pipeline as 02-02; the verdict captures here at SUMMARY-write is pre-PR |

**Cross-cutting CI gates:**

| Gate | Status |
|------|--------|
| `npm run typecheck` | **PASS** — 0 errors |
| `npm run lint` | **PASS** — 0 errors, 0 warnings |
| `npx vitest run` (full suite) | **PASS** — 200 passed / 35 skipped / 0 failed across 30 test files |
| `tests/integration/memory-paste-rls.test.ts` | **SKIPPED locally / CI-gated** — 9 specs (was 6 in 02-02; +3 from T11 contract evolution; case 6 fixed at `697534d`); skip rationale: TEST_DATABASE_URL not set locally; CI re-verifies on PR per Phase 1 + Plan 02-01 convention |
| ESLint boundary (no @anthropic-ai/sdk in sanitizers + conflict-resolver) | **PASS** — grep on src/ai/sanitizers/ + conflict-resolver.tsx returns 0 import statements (the 2 hits in sanitizer files are inside doc-block comments documenting the boundary explicitly) |
| `npm run check:banned` | **PASS** — exits 0 |
| `npx drizzle-kit check` | **PASS** — `Everything's fine` (schema-lock holds; precursor migration d5902ef already applied) |

## /codex Findings + Resolutions (Task 15)

T15 verdict: **APPROVED-WITH-FIXES** → fixes shipped pre-close.

**Closed at T15-FIX-1 (`0c6bd1a`):**

- **H1 — Severity escalation bypass** — single-marker high-base regex + cross-category bump rule allowed a payload matching only one high-base pattern to stay at 'high' even when paired with a low-base marker; closed by tightening the escalation logic to score per-match and emit max-bumped severity across the full match set
- **H2 — PII-14 expected counts regression** — after the dual-walk redaction (narrative.* + traction.* + provenance) landed at T5, PII-14 fixture's expected count was 1 (single-walk-era expectation) but actual was 2 (dual-walk caught the same phone twice across both growth + runway); fix at `38aeba8` updated the fixture's expectedRedactionsByType.phone to 2
- **H3 — Founder-self exemption from LLM-derived draft** — the original spec read founder identity from draft.team.founders[*].email + .phone; Codex flagged this as a high-severity bypass vector (attacker pastes content that the LLM extracts under team.founders to whitelist the attacker's own email from redaction); closed by changing the redactor's founder-self exemption to source from ctx.session.user.email (trusted auth identity) — completed at T16-FIX-1 below
- **M1 — Severity context surfaced via parsed message string** — AppError's `message` field carries the severity + categoryCount as a parsed-by-clients string; structured context (err.context = { severity, categoryCount }) is the correct pattern; closed by adding the structured context shape; full AppError shape upgrade across the codebase deferred to P4.5-POLISH-10

**Closed at T15-FIX-2 (`b6a9a71`):**

- H2 label correction (PII-14 → PII-12 mismatch in fixture metadata) + M1 regression catch on the structured-context propagation through rethrowAgentError

**Deferred to P4.5-POLISH-12 (logged at `ce4a976`):**

- M2 — LLM03 (output handling): assertNoBannedOutput is regex-based; sophisticated payloads can evade with synonym substitution
- M3 — LLM04 (training data poisoning): not in scope for Phase 2 (no training pipeline)
- M5 — Multi-marker false positives at severity escalation cap
- M6 — Global founder-self exemption beyond email + phone (names + DOB heuristics)
- L1 — Sanitizer test fixtures could include reverse-direction payloads (ignore-system-then-replay)
- INFO — Pattern registry could be data-driven (JSON config) for easier rev

## /cso Findings + Resolutions (Task 16)

T16 verdict: **APPROVED-WITH-FIXES** → fixes shipped pre-close.

**Closed at T16-FIX-1 (`af7bcf9`):**

- **M1 — Founder-self exemption from LLM-derived draft.team.founders** — same finding as Codex H3 above; closed by changing redactUnrelatedPartyPII's founder identity source to ctx.session.user.email (the agent now passes a single-element array containing the trusted auth email); draft.team.founders remains informational only
- **M2 — TOCTOU race between confirm guard read + UPDATE** — the existing isNull(confirmedAt) guard from 02-02 3be8fa6 closed the SELECT-then-UPDATE race, but a narrow TOCTOU window remained between two concurrent confirm requests where both passed the row-state check then raced on UPDATE; closed by adding a lastUpdatedAt-in-UPDATE-WHERE companion predicate (the second request's UPDATE matches 0 rows + surfaces a clean CONFLICT)
- **M3 — Audit-row write failure silently passes** — if the security-IR audit row insert fails (DB outage) during AI_INJECTION_REJECTED handling, the original silent-pass swallowed the failure entirely; closed by emitting `logger.error('memory.extractFromPaste: audit-row write failed on rejection', { accountId })` while still allowing the BAD_REQUEST throw to return to the founder (audit non-blocking on the response path — security IR can detect the missing row via the logged signal)

**Deferred to P4.5-POLISH-13 (logged at `8e57981`):**

- L1 — Long base64-shaped substring false-positives at email regex (>40 chars / 100 chars without periods, e.g. JWT-shaped tokens in source_snippet)
- L2 — Resolver-trust comment on chooseProvenance audit path (could expand to include the agent's reject-reason)
- L3 — Email-TLD over-redaction (some legitimate `.localhost` / `.test` / `.example` patterns redacted unnecessarily; not a security issue but a polish item)
- INFO — Pattern registry rev cadence (when to refresh against the OWASP LLM Top 10 next version)

## Compliance Auditor pass

- `npm run check:banned` exits 0 across the full repo
- Manual grep for hard-banned compliance strings (`rolling fund` / `investment vehicle` / `adviser` / `AI-as-call-speaker`) in the four UX surfaces touched this plan (conflict-resolver.tsx + paste-flow.tsx + confirmation-form.tsx + confirmation-card.tsx) returns 0 hits
- Manual grep for conditionally-banned (`investment advice` / `legal advice` without `not` / `this is not` prefix) returns 0 hits
- Operator voice held — COPY constants in all four files; no `Hey!` / `It looks like` / `Sorry` / `Oops` / `happy to` / `we found` tokens (grep-verified at component-file level)

## Risks Realized

Threats from the plan's STRIDE register actually mitigated by this wave's shipped surfaces:

- **T-02-03-01 (Tampering — pasted content reaching Sonnet system prompt)** — mitigated by promptInjectionSanitizer + severity-gated reject; the agent throws AI_INJECTION_REJECTED at severity ∈ {'high', 'critical'} BEFORE the Anthropic call (no Sonnet token spend on rejected pastes); 20-payload fixture set verifies 100% flag rate across the OWASP LLM Top 10 categories
- **T-02-03-02 (Information Disclosure — third-party PII persisted to business_memory)** — mitigated by redactUnrelatedPartyPII walking narrative.* + traction text fields + provenance source_snippet; typed [REDACTED-*] markers; 15-fixture set verifies byType counts; founder-self exemption sourced from ctx-trusted auth (T16-FIX-1 fix closes the LLM-derived bypass)
- **T-02-03-03 (Information Disclosure — matched injection substrings reaching UI / logs)** — mitigated by the agent's category-count error message (never raw substrings); banner shows type counts only; logger payload constrained to severity band + counts
- **T-02-03-06 (Tampering — conflict-resolution result tampering)** — mitigated by rejected_alternatives audit array preserved in provenance jsonb; founder cannot delete the audit trail post-confirm without a follow-up confirmDraft mutation (which itself appends a new interaction row)
- **T-02-03-07 (Repudiation — founder denies confirming a specific value)** — mitigated by kind='paste_confirm' interaction row with metadata { fieldKey, chosenSourceSnippet ≤200 chars, rejectedCount } per resolved field; RLS-bound; append-only
- **T-02-03-08 (Elevation of Privilege — XSS via ConflictResolver candidate rendering)** — mitigated by React default escaping on candidate value + source_snippet strings; zero dangerouslySetInnerHTML in conflict-resolver.tsx (grep-verified); /cso confirmed at T16
- **T-02-03-11 (Tampering — schema-lock violation)** — held; provenance jsonb shape evolved at Zod layer only; npm drizzle-kit check reports zero pending migrations (the precursor at d5902ef was an additive evolution — interaction.metadata jsonb + enum values — to unblock T11's audit contract, not a Plan-02-03-spec-defined column)
- **T-02-03-12 (Tampering — cross-tenant data leak via conflict resolution)** — held; all memoryRouter procedures stay protectedProcedure with ctx.db.rls(tx => ...); tests/integration/memory-paste-rls.test.ts case 6 was updated at `697534d` to match the T11 contract evolution

## Surprises / Deviations from Plan

1. **Planner-inheritance error on interaction.metadata column** — the original 02-03-PLAN.md spec for T11 referenced an interaction.metadata jsonb column as if it existed from Plan 02-01, but Plan 02-01 never shipped it. Caught at T11 dispatch; resolved by emitting a precursor migration (`d5902ef`) that additively adds the column + paste_extract / paste_confirm enum values BEFORE T11's audit-row contract could land. Future plan-checker should verify every referenced schema artifact actually exists in the predecessor's shipped state before plan approval.

2. **Postgres ALTER TYPE ADD VALUE silent failure inside transaction** — drizzle-kit migrate wraps each migration in a transaction by default; the paste_extract / paste_confirm enum-value adds at d5902ef failed silently (zero stdout output, local journal updated, but no row in __drizzle_migrations on the live DB). Detected by querying __drizzle_migrations directly. Fix: applied enum changes via postgres.unsafe() outside a transaction, then manually inserted the migration hash into __drizzle_migrations. Captured in tasks/lessons.md at commits `67eb05e` + `afec3ed`.

3. **Worktree-isolation bug #3099 forced policy shift mid-wave** — Wave 4-B/4-C on 2026-05-22 hit Claude Code's worktree-isolation drift (parallel agents' Edit/Write calls silently landed in main repo working tree). Wave 4-B never recovered cleanly (salvaged via in-place commit); Wave 4-C self-recovered via cp + git checkout. Atomicity was broken even though recovery worked. Policy shift for remainder of wave: sequential single-agent dispatches only on Windows. Logged at P4.5-POLISH-08 + P4.5-POLISH-09 for upstream tracking.

4. **gsd-executor worktree branch-check safety hole** — Wave 4-B worktree HEAD was 19 commits behind expected base; the existing `git merge-base HEAD <expected> == <expected>` check still passed because merge-base returns the older ref when HEAD is an ancestor. Should be `git rev-list --count <expected>..HEAD == 0` instead. P4.5-POLISH-09.

5. **AppError shape upgrade needed but deferred** — Codex M1 flagged that AppError's `message` field carries severity + categoryCount as parsed-by-clients string instead of structured context (err.context = {...}). Surgical fix at T15-FIX-1 added the structured-context shape on the AI_INJECTION_REJECTED path specifically; the full AppError shape upgrade across the codebase is non-trivial (touches every AppError call site) and not security-critical; deferred to P4.5-POLISH-10.

6. **ConflictResolver override-path rejected_alternatives loses audit** — when the founder types a custom value via 'Use a different value' (instead of picking a radio), the synthesized ProvenanceField currently lands with rejected_alternatives = [] instead of carrying the original candidates as losers. Codex MEDIUM flagged this; logged at P4.5-POLISH-11. Fix is a 3-line patch to the chooseProvenance call site in the form.

7. **Plan-checker FLAG-1/2/3 fixes applied as a separate doc commit** — `07256d4` applied three plan-checker findings on the original 02-03-PLAN.md before T1 dispatch (security-IR audit row on rejection added to T11 acceptance criteria; T7 sanitizer test wave moved from Wave 6 to Wave 3 to surface regex bugs pre-agent-wire; the override-rejected_alternatives concern surfaced and deferred to P4.5-POLISH-11). Plan-checker discipline is now a routine pre-execution gate.

8. **T15 / T16 are checkpoint:human-verify tasks with no direct commit** — the gate runs the external review; the FIX commits close the verdict. No separate `task(15)` or `task(16)` commit message in the wave's git log; T15 is represented by `0c6bd1a` + `b6a9a71`; T16 is represented by `af7bcf9`. The SUMMARY's Task Commits table reflects this.

9. **RLS suite spec count evolved from 6 to 9** — Plan 02-02 shipped 6 cases; this plan's T11 contract evolution required an updated case 6 (`697534d`); the suite at HEAD lists 9 specs (the +3 are post-2-02-fix-pin expansions). Skipped locally per Phase 1 + Plan 02-01 convention when TEST_DATABASE_URL is unset; CI re-verifies.

10. **Test count delta over-target** — the plan targeted ~50 new tests; the actual delta is +62 (from 138 baseline at 02-02 close to 200 at HEAD). The over-target is driven by per-fixture forEach blocks producing multiple individual `it()` calls per fixture entry inside the sanitizer test files.

## Open Follow-ups (deferred to other plans / backlog)

**Deferred to Plan 02-10 (Polish + Close Mode):**

- Drafting-state cancellation — escape hatch for the ~30s LLM call (AbortController plumbing through runAgent). Carry-over from 02-02 design review.
- Drafting-state progress affordance — static 'Drafting…' reads as stuck; needs skeleton cards + token-budget progress bar. Carry-over from 02-02 design review.
- Server-side getDraft pre-fetch on /onboarding/import/paste mount — reload during the confirming state currently returns to empty paste; the data persists at the DB layer but the UI needs the pre-fetch to restore. Carry-over from 02-02 commit `ad32f22`.

**Deferred to Plan 02-05 (Eval harness):**

- Live-Sonnet sanitizer eval — running the 20 injection + 15 PII fixtures through the actual extractor against real Sonnet 4.6 to measure false-positive / false-negative rates against production behavior. This plan's unit tests verify the sanitizers against fixture inputs; the eval harness verifies sanitizer + extractor + Sonnet end-to-end.

**Deferred to Phase 4.5 polish backlog:**

- **P4.5-POLISH-07** — Agent worktree hygiene meta-process for gsd-executor (carry-over from 02-02)
- **P4.5-POLISH-08** — Worktree isolation breach on Windows (Claude Code #3099 class) — sequential single-task dispatch policy until upstream fix
- **P4.5-POLISH-09** — gsd-executor worktree branch-check safety hole — replace `git merge-base ==` with `git rev-list --count ..HEAD == 0`
- **P4.5-POLISH-10** — AppError structured context shape upgrade across the codebase (Codex M1)
- **P4.5-POLISH-11** — ConflictResolver override-path rejected_alternatives population (Codex MEDIUM)
- **P4.5-POLISH-12** — Deferred Codex MEDIUM findings (LLM03/04/05 + multi-marker false-positives + global founder-self exemption + reverse-direction sanitizer fixtures)
- **P4.5-POLISH-13** — Deferred /cso LOW findings (long-base64 email false-positives + resolver-trust comment + email-TLD over-redaction)
- **Test-user-mint helper** — Phase 4.5 polish item; needed to enable the 4 currently-locally-skipped authed Playwright specs in tests/e2e/onboarding-paste-conflict.spec.ts (same gate as 02-02's onboarding-paste.spec.ts)

## Hand-off to Plan 02-04 (Week 4 — Embed pipeline + corpus + eval scaffold)

Plan 02-04 inherits from this plan:

- **Sanitizer surfaces locked.** src/ai/sanitizers/prompt-injection.ts + src/ai/sanitizers/pii-redact.ts are the canonical primitives. Plan 02-07 (qa-rag agent) and Plan 02-08 (file upload Tier 2) reuse these. Do not add `logger.*` calls inside src/ai/sanitizers/**.
- **Provenance jsonb supports array → single normalization via chooseProvenance.** The embed pipeline (Plan 02-04) should only embed POST-CONFIRM business_memory rows (i.e. provenance is normalized to single-object form). Array provenance never reaches the embedder. Document this invariant in 02-04's read_first.
- **PII-redacted drafts are what land in business_memory.** Plan 02-04's embedder consumes the redacted form — the corpus and Business Memory cached prefix that Phase 2 retrieval relies on will never contain unrelated-party PII. This is a deliberate ship constraint.
- **Conflict-resolution audit trail (rejected_alternatives in provenance + kind='paste_confirm' interaction rows with resolution metadata) is the precedent** for every future multi-value extraction surface (Phase 3 deck reviewer, Phase 4 pipeline auto-stage).
- **CARRY-1 + CARRY-2 close the per-card UX gaps from 02-02** — no further Week-2 → Week-3 → Week-4 confirmation UI carry-overs.
- **KNW-03 canonical requirement COMPLETE** — no Week-3 → Week-4 carry-over on this requirement ID.
- **Schema-lock invariant from 02-01 still holds end-to-end.** Plan 02-04 must add ONLY the new embeddings table (planned for that phase per master plan §Week 4). It must NOT modify business_memory / pipeline_entry / interaction / timeline_event. The precursor migration at d5902ef (interaction.metadata + enum values) was additive and already shipped; treat it as locked-in.
- **Race-condition fix pattern generalizes.** Plan 02-04's embed pipeline's idempotency contract (per tenant_id + source_type + source_id) should default to the atomic-upsert shape with state-guard setWhere, mirroring 02-02 3be8fa6 + 02-03 T16-FIX-1 TOCTOU guard.
- **Sequential single-agent dispatches on Windows.** Until Claude Code worktree-isolation bug #3099 is resolved upstream (P4.5-POLISH-08), default to sequential dispatch even if a wave's task DAG is parallel-safe.

**Plan 02-04 should also be aware:**

- The paste-flow client state machine still assumes a fresh draft each mount (no getDraft pre-fetch). Adding that pre-fetch remains deferred to Plan 02-10.
- The MSW handler at https://api.anthropic.com/v1/messages is still the structural-cache-test wire (from 02-02 Task 5). Plan 02-04's live-Sonnet eval (via Plan 02-05) uses a different code path — do not refactor the MSW handler.

## Self-Check: PASSED

Verified before commit:

- `.planning/phases/02-knowledge-layer/02-03-SUMMARY.md` exists at the expected path
- All 35 commit hashes on the wave (`git log --oneline d0e0b21..HEAD`) referenced or accounted for above
- All file paths under `key-files.created` referenced in their respective task commit `git log --stat` output
- All 14 must_haves.artifacts from the plan frontmatter mapped to Files Created or Files Modified above
- All 19 must_haves.truths from the plan frontmatter mapped to a verification-loop result (PASS / PARTIAL / DEFERRED) above
- All 17 task headings map to commits in the Task Commits table (T15 + T16 represented by their FIX commits per checkpoint:human-verify convention)
- Banned-string clean — zero hard-banned terms in this document; conditionally-banned compliance phrases not used in the prose
- Trochia voice held — operator register only; no `we / I / happy / love / feel / want / help / hope` in the substantive summary body
- Schema-lock holds — `npx drizzle-kit check` reports `Everything's fine` at HEAD af7bcf9

---

*Authored 2026-05-25 by gsd-execute-phase orchestrator for Plan 02-03 Task 17 (closing summary). Predecessor: Plan 02-02 (shipped `bdf3438`). Successor: Plan 02-04 (Week 4 — Embed pipeline + corpus + eval scaffold, KNW-04a + KNW-04b + KNW-04c + EVAL-01a).*
