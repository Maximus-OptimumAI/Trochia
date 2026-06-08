# Fix Plan — Make Confirmed Business Memory Answerable (chunking, not threshold)

**Branch:** `fix/memory-answerable` off `main` @ `573cc6a` (prod-smoke fixes #8 merged + live).
**Status:** PLAN — awaiting founder review. No code changed yet.
**Ship path:** branch → implement → `npm run gate` + `eval:run` (live, seeded) → `/codex` + `/cso` → PR → squash-merge → prod deploy → re-embed ClockPay → re-validate Q&A.

---

## Root cause (MEASURED, 2026-06-06/07)

Confirmed business memory is unanswerable in prod Q&A. Two compounding defects in the embed pipeline, both proven by direct measurement against prod:

1. **The narrative embeds as ONE 1398-char chunk.** `DEFAULT_CHUNK_OPTIONS` is 800 tokens ≈ **3200 chars** (`chunk.ts:53,81`), so ClockPay's 1398-char narrative collapses to a single chunk. Facet questions, embedded as `inputType:'query'`, score **0.42–0.49 cosine** against that diluted blob — under the **0.6 `GROUNDING_THRESHOLD`** (`qa-rag.agent.ts:84,220`) — so `askQa` returns the deterministic "I don't have that in your knowledge base yet" with **no Opus call**. Even *"What does ClockPay do?"* (a near-verbatim ask for the chunk's content) scored **0.42**. Out-of-scope control (*"weather in Paris"*) = **0.26**.

2. **Scalar facets are never embedded at all.** The embedder flattens ONLY `narrative.{problem,solution,why_now,why_us}` + `traction.{growth,runway}` (`embed-memory.ts:118-146`) and **explicitly excludes** `companyName, sector, stage, geography, oneLiner, …` (design note `embed-memory.ts:51-57`: "Scalar fields … are NOT embedded … hybrid retrieval uses FTS for the relational side"). But FTS runs `to_tsvector('english', chunk_text)` over the embeddings rows (`retrieve.ts:225,233`) — and if "Pre-seed"/the sector never land in any `chunk_text`, **FTS can't match them either**. So *"What stage?"* / *"What sector?"* are unanswerable by BOTH retrieval sides, independent of chunk size.

**The fix is chunking + embedding the facets as labeled chunks — NOT a threshold drop.** The measured in/out gap (0.42 vs 0.26) exists but sits at a pathologically low absolute level *because* of the oversized single blob; lowering the floor to ~0.38 on an n=5 sample would mask the defect and weaken the anti-hallucination guarantee globally. Chunking raises true-match cosines into a healthy band so the existing 0.6 floor (or a modest, **eval-proven** adjustment) works with margin.

---

## Tasks

### T1 — CHUNKING: field-aligned, LABELED chunks (the core fix)

**Today:** `embed-memory.ts:118-170` concatenates the narrative/traction text-surface into one `narrativeText` string, calls `chunkText(narrativeText, DEFAULT_CHUNK_OPTIONS)` → 1 chunk for any memory under ~3200 chars. Scalars excluded.

**Change:** introduce a pure, deterministic `buildMemoryChunks(row)` that emits **one labeled chunk per populated field**, each chunk's text carrying its field label so a facet query aligns to a single-fact chunk:

```
Company name: ClockPay
What the company does: <oneLiner — fallback narrative.solution>
Sector: <sector>
Stage: <stage>
Geography: <geography>
Incorporation status: <incorporationStatus>
Founded: <foundingDate>
Problem: <narrative.problem>
Solution: <narrative.solution>
Why now: <narrative.why_now>
Why us: <narrative.why_us>
Growth: <traction.growth>
Runway: <traction.runway>
Traction — MRR/ARR/customers/currency/valuation/burn: <rendered as labeled text when present>
```

**Granularity decision (justified): per-field labeled chunks, with long narrative fields sub-chunked-and-relabeled.**
- **Why per-field:** facet questions are short and target exactly one field. A short, single-fact labeled chunk maximizes query↔chunk cosine (the measured failure was dilution: 1398 chars dragged *"what do you do"* to 0.42; a one-line `What the company does: …` chunk should land far higher). Per-field also prevents cross-facet dilution.
- **Why labels:** the label text feeds BOTH retrieval sides — it lifts vector similarity AND becomes an FTS keyword (`Sector:` matches "sector"), repairing defect #2 on both paths.
- **Long fields:** if a single field's labeled text exceeds the char budget, sub-chunk it via the existing `chunkText` and **re-prefix every sub-chunk with the same field label** (`Problem (cont.): …`) so a mid-field sub-chunk still aligns. This preserves semantic coherence for genuinely long prose without re-introducing the blob.
- **Trade-off (acknowledged):** ~8–16 rows/memory vs 1. Well under the existing 64-chunk hard cap (`embed-memory.ts:161-170`), batched by 8 (`embed-memory.ts:177`); incremental Voyage cost is marginal (tiny chunks, few tokens each). Chunk count rises with content, never unbounded.

**Files:**
- **NEW** `src/ai/chunking/memory-chunks.ts` — `buildMemoryChunks(row): Chunk[]` (reuses `Chunk`/`chunkText` from `chunk.ts`). Pure, deterministic, zero I/O (mirrors `chunk.ts` discipline so it's unit-testable). Skips empty fields; assigns a single contiguous `idx` counter across all chunks; estimates `tokenCount` via the existing heuristic.
- **EDIT** `src/inngest/functions/embed-memory.ts` — replace the `narrativeText` concat + single `chunkText` call (`:135-170`) with `buildMemoryChunks(row)`. Rewrite the "What gets embedded" docblock (`:51-57`, `:118-146`) to record the **design reversal**: scalar facets are now embedded as labeled chunks; FTS complements but is no longer the sole relational path. Keep the `EMBED_NOTHING_TO_EMBED` guard (now fires only if every field is empty) and the 64-cap.
- **NEW** `tests/ai/chunking/memory-chunks.test.ts` — determinism (repeat-call byte-stability), label format per field, empty-field skip, long-field sub-chunk relabel + idx contiguity, all-empty → `[]`.

**No schema migration** — see the dedicated assertion below.

### T2 — EVAL: facet fixtures + eval-gated threshold (has a prerequisite)

**Prerequisite the founder must know about — the QA grounding eval currently has NO corpus.** `qa-grounding.ts` runs `askQa` **live** (`:100`) against whatever `embeddings` rows exist for the fixture tenant `e7a1c0de-…001`, but that UUID appears **only in the fixture JSON** — there is no seed that writes embeddings for it (`scripts/` has none). So a live `eval:run` today would have every in-scope Q fall under 0.6 → fail. **A seed is a hard prerequisite** for making the threshold decision eval-backed.

**Sub-tasks:**
1. **NEW** `scripts/seed-eval-corpus.ts` — **DECISION (baked):** seeds exactly **ONE representative confirmed `business_memory`** for the eval tenant `e7a1c0de-…001`, whose field shape **mirrors ClockPay's** (a populated `companyName`, `oneLiner`, `sector`, `stage`, `geography`, `narrative.{problem,solution,why_now,why_us}`, `traction.{growth,runway,…}`), **plus the out-of-scope control** the existing fixtures assume. It is a **deterministic, in-repo synthetic fixture — NOT a prod pull** (XC-01: no real customer data ever enters the eval/build path). The seed runs `buildMemoryChunks` + Voyage embed and writes the `embeddings` rows via the same pipeline path. Wire as a documented pre-step of `eval:run` (or a one-shot the runner invokes when the corpus is absent). All facet fixtures resolve against this single seeded tenant.
2. **Fixtures** — add in-scope facet entries to `src/ai/eval/fixtures/qa-grounding/in-scope.json` (or a new `facets.json` registered in `fixtures/index.ts:71`): *"What stage is the company raising at?"* (`stage`), *"What sector is the company in?"* (`sector`), *"What is the business name?"* (`companyName`), *"What does the company do?"* (`oneLiner`). Each `isOutOfScope:false`, `expectedRetrievableMarker` set to the field. **Keep** the existing out-of-scope fixtures.
3. **Threshold decision, eval-backed (no blind drop). DECISION (baked): gate the eval on grounding pass/reject + cosine separation — NOT on marker-level matching.** `qa-grounding.ts` already gets `result.debug.maxVectorScore` (`qa-rag.agent.ts:223,279`) but **ignores it**. Add an observation that records per-Q `maxVectorScore` and emits a sweep: `min(in-scope)` vs `max(out-of-scope)`. The eval **passes** iff: every in-scope Q is grounded+cited, every out-of-scope Q is rejected, AND a clean cosine separation holds (`min(in-scope) > max(out-of-scope)`). **Threshold rule:** keep `GROUNDING_THRESHOLD = 0.6` if `min(in-scope maxVectorScore) > 0.6` with clear margin over `max(out-of-scope)`; otherwise set it to a value inside the proven gap (e.g. midpoint), **with the eval sweep as the artifact**. Expectation post-chunking: short labeled facet chunks push in-scope well above 0.6, so 0.6 likely holds — the eval proves it.
4. **Validation-time top-hit log (baked).** At eval/validation time, log **which `chunk_idx` + label was the top-ranked hit per query** (the strongest-`vectorScore` candidate's `sourceId`/`chunkIdx` + a short label echo). This makes **wrong-chunk matches visible** — e.g. "What sector?" top-hitting the `Problem:` chunk instead of `Sector:` is a chunking-design signal even when the answer still grounds. Content-blind beyond the already-embedded label. (Surfaced in the eval check and/or the T3 `qa.ask` debug path; eval-only, not a new client-facing field.)
5. **If retuned:** update `qa-rag.agent.ts:84` AND the hardcoded pin `tests/ai/agents/qa-rag.agent.test.ts:144-145` (`expect(GROUNDING_THRESHOLD).toBe(0.6)`), else that unit test breaks.
6. **`expectedRetrievableMarker` is NOT load-bearing in this plan (baked).** It stays declared-but-unread for now; the eval gates on grounding pass/reject + cosine separation (sub-task 3) plus the top-hit visibility log (sub-task 4). **Deferred fast-follow:** a marker-level assertion (the grounded answer must cite the `expectedRetrievableMarker` field) — tracked as **FOLLOWUP-EVAL-MARKER-ASSERTION-01**.

**Files:** `scripts/seed-eval-corpus.ts` (new), `src/ai/eval/fixtures/qa-grounding/in-scope.json` (+`fixtures/index.ts` if a new file), `src/ai/eval/checks/qa-grounding.ts` (observe maxVectorScore; optional marker assertion), `src/ai/agents/qa-rag.agent.ts:84` + `tests/ai/agents/qa-rag.agent.test.ts:144-145` (only if retuned), `package.json` (eval seed wiring).

### T3 — OBSERVABILITY: log `maxVectorScore`

The deciding number is computed and discarded. `qa.ts:166-167` destructures `debug` away (correctly — the P2-D privacy contract keeps `debug` off the **tRPC boundary**), and the success log (`qa.ts:210-217`) emits only `grounded` + `citationCount`. **Logging a bare float server-side does not violate P2-D** (it never crosses to the client, and a cosine scalar carries no content).

**Change:** read `result.debug.maxVectorScore` server-side and add it to the `logger.info('qa.ask: ok', {...})` call (`qa.ts:210`) as a bare number. Do **not** change the return boundary — `debug` stays stripped from what crosses to the client. Query/answer/chunk text remain unlogged. One-line addition + a doc note on why the scalar is privacy-safe.

**Files:** `src/server/routers/qa.ts:166-217`.

### T4 — FOLD-IN QUICK WINS (independent, low-risk, separate commits)

**4a — currency + customers → free-text. DECISION (baked): single free-text `z.string()` for BOTH (not an array, not a union).**
- `business-memory.zod.ts:334` `currency: z.string().length(3).optional()` → `z.string().optional()` (accepts "USD, NGN, USDc, USDT").
- `business-memory.zod.ts:335` `customers: z.number().optional()` → `z.string().optional()` (accepts "150", "150 Businesses"). Pure `z.string()` — **no** `z.union([z.number(), z.string()])`; keep one consistent free-text shape.
- **DB column already holds free text — NO migration.** Both fields live inside the `traction` **jsonb** column (`tractionSchema` `.catchall(z.unknown())`, `business-memory.zod.ts:330-341`; `traction: jsonb('traction')`, `db/schema/memory.ts:147`). jsonb stores a string indistinctly from a number; the column type does not change.
- **Downstream touch (do not miss):** the confirmation form treats `customers` as numeric (`fallbackInputType="number"`, the TRACTION numeric set in `confirmation-form.tsx`). Remove `customers` from that numeric set so the input accepts free text; `currency` is already a text input. Update the `tractionSchema` docblock (`:322-329`) which currently asserts a 3-char ISO code.
- **Forward caveat:** any later consumer reading `traction.customers` as a number (Pitch Lab, Phase 3) must tolerate a string — none exists in Phase 2.

**4b — human-readable validation errors.** Raw Zod text leaks verbatim today: `confirmation-card.tsx:325-335` renders `errorMessage` (the react-hook-form leaf `.message`, e.g. *"String must contain at most 3 character(s)"*, *"Expected number, received string"*, *"Required"*) with an **empty** `COPY.errorPrefix` (`confirmation-card.tsx:72`). No zod→friendly mapping exists anywhere (grep-confirmed).
- **NEW** `src/components/memory/humanize-error.ts` — `humanizeFieldError(fieldKey, rawMessage): string` mapping common zod codes → operator-voice copy, field-aware (e.g. required → "<Label> is needed to save"; date → "Enter a date like 2024-01"). Applied at the `pickError` call site (`confirmation-form.tsx:803`) so the card receives friendly text; never render a raw zod string. Keep it small, BRAND-voice.

**4c — reusable card skeleton.** Only `SkeletonBlock` (a plain `animate-pulse` block) exists; no card/avatar+lines skeleton; **no spinners anywhere** on the memory surfaces (loading is `SkeletonBlock` in memory-workspace + two text-only "Drafting…"/"Grounding…" panels).
- **NEW** `src/components/primitives/skeleton-card.tsx` — `SkeletonCard` composing `SkeletonBlock` (avatar circle via `rounded-full` className + N stacked text-line blocks). No `SkeletonBlock` API change (it already takes `className`).
- **DECISION (baked): CSS-only shimmer/pulse — no JS animation library.** Fill is **Stone `#ECEAE3`** — i.e. the `stone` brand token (`tailwind.config.ts:26`, `globals.css:35`, `BRAND.md:35`); reference it as `bg-stone` (optionally `/60`), never a raw hex (CLAUDE.md off-token-color ban). **Honor `prefers-reduced-motion`:** the shimmer/pulse animation is disabled under `@media (prefers-reduced-motion: reduce)` (or Tailwind's `motion-reduce:` variant), falling back to the static Stone fill. If a gradient *sweep* shimmer (vs the existing opacity `animate-pulse`) is used, its keyframe is added to the design system / `globals.css` as a token-scoped utility — still CSS-only.
- Render during fetching/pending on: `memory-workspace.tsx:112-114` (replace the two generic `h-40` blocks), `paste-flow.tsx:459-481` (drafting panel), `qa/sidebar.tsx:189-199` (grounding panel). Leave button-pending states as-is.

**UI tasks (4b, 4c) honor `docs/BRAND.md` voice + tokens and `docs/DESIGN-REFERENCE.md` anti-patterns** (CLAUDE.md workflow rule). No Tailwind color/font outside the brand token system.

### T5 — VALIDATION (post-merge + deploy)

1. **Re-embed ClockPay via the pipeline** (not by hand): re-fire `memory.confirmed` for account `a9e58db3-6f84-4ea7-9177-c3e28804c809`, businessMemoryId `15a3b27b-839e-41ec-b9f9-8f450f603164` — via Inngest dashboard event replay, or a one-shot emit, or a re-confirm in the UI. The pipeline's delete-then-insert (`embed-memory.ts:261-283`) atomically replaces the old single chunk with the new labeled set. **No manual prod DB write.**
2. **Read-only prod count** (the established pooler-`DATABASE_URL` harness): expect **N labeled chunks** (~8–14) for the account, `embedding_model_version='voyage-3-large'`, vectors non-null.
3. **Re-fire the cosine probe** (throwaway) for *"what stage / what sector / what do you do"* → expect `maxVectorScore ≥ threshold` now.
4. **Live Q&A:** those three questions return **grounded answers + citations**; out-of-scope control still refused. Confirm via the `qa.ask: ok` log (now carrying `maxVectorScore` from T3) `grounded:true`.

---

## No-migration assertion (load-bearing)

Nothing under `src/db/schema/**` changes. The schema-lock guard stays satisfied.

- **`chunk_idx`** is an `integer` already sized for N contiguous rows; going 1→N (T1) needs no DDL.
- **The label lives inside `chunk_text`** (a `text` column) — no new column.
- **Idempotency already handles variable N:** the dedup unique index `(account_id, source_type, source_id, chunk_idx, embedding_model_version)` (`embeddings.ts`) + the in-transaction **DELETE-then-INSERT** on `(account, source_type='memory', source_id, model)` (`embed-memory.ts:261-283`) reassign all `chunk_idx` on every re-embed, so 1→N and N→M are both already covered. A single contiguous counter satisfies the unique index.
- **currency/customers** (T4a) live in the `traction` jsonb (`.catchall(z.unknown())`) — sub-shape changes are zod-only, on the no-migration side of the file's own schema-lock invariant.
- **Net:** only TypeScript, JSON fixtures, a seed script, and eval/test files change. Zero `drizzle-kit` migration.

---

## Eval-gated threshold (explicit)

`GROUNDING_THRESHOLD` is **not** touched blindly. It moves only if the T2 eval sweep (real `askQa` over the seeded corpus + facet fixtures) shows `min(in-scope maxVectorScore)` does not clear 0.6 with margin over `max(out-of-scope)`. Default outcome: **keep 0.6** (chunking is expected to lift facet cosines above it). Any change ships with the eval report as proof AND the `qa-rag.agent.test.ts:144-145` pin updated in the same commit.

---

## Files expected to change (review checkpoint)

| Area | Files |
|---|---|
| T1 chunking | **NEW** `src/ai/chunking/memory-chunks.ts`; `src/inngest/functions/embed-memory.ts`; **NEW** `tests/ai/chunking/memory-chunks.test.ts` |
| T2 eval | **NEW** `scripts/seed-eval-corpus.ts`; `src/ai/eval/fixtures/qa-grounding/in-scope.json` (+`fixtures/index.ts` if new file); `src/ai/eval/checks/qa-grounding.ts`; `package.json` (seed wiring); `src/ai/agents/qa-rag.agent.ts:84` + `tests/ai/agents/qa-rag.agent.test.ts:144-145` **only if retuned** |
| T3 observability | `src/server/routers/qa.ts` |
| T4a free-text | `src/ai/schemas/business-memory.zod.ts:334-335`; `src/components/memory/confirmation-form.tsx` (numeric-set + traction docblock) |
| T4b friendly errors | **NEW** `src/components/memory/humanize-error.ts`; `src/components/memory/confirmation-form.tsx:803`; possibly `confirmation-card.tsx` |
| T4c skeleton | **NEW** `src/components/primitives/skeleton-card.tsx`; `memory-workspace.tsx`, `paste-flow.tsx`, `qa/sidebar.tsx` |

---

## Out of scope / non-goals

- Streaming Q&A; corpus expansion beyond memory; the FTS stored-column + GIN index (FOLLOWUP-FTS-GIN-INDEX-01).
- Week-3 update/conflict resolution + confirmed-row reimport (FOLLOWUP-MEMORY-REIMPORT-01).
- Real tokenizer swap (chunk.ts heuristic stays; Plan 02-05 owns it).
- Full inline edit of a confirmed memory; the confirmed view stays terminal read-only.
- Any Phase 3+ module.

---

## Verify-loop (at execute time)

`npm run gate` (typecheck → lint → check:banned → full vitest, incl. new `memory-chunks` tests + the threshold pin) → expect prior known local-only domain-regex fails ONLY. Then `eval:run` **live** (`EVAL_LIVE_REQUIRED=1`, `ANTHROPIC_API_KEY`+`DATABASE_URL`+Voyage, against the seeded eval corpus) green with the maxVectorScore sweep recorded. Then `/codex` (correctness — touches the embed pipeline + retrieval-adjacent scoring) + `/cso` (data flow + privacy — the `maxVectorScore` log line + chunk labels carry no PII beyond what was already embedded). Then PR → squash-merge → prod deploy → T5 validation.

---

## Pre-implementation code confirmations (reviewer job A — verified by reading code)

All four load-bearing details confirmed against the code on `573cc6a`. No STOP-and-flag conditions found.

1. **Re-embed DELETE scope — CONFIRMED delete-by-source, transactional.** `embed-memory.ts:262-270` deletes `WHERE accountId AND sourceType='memory' AND sourceId AND embeddingModelVersion` — **no `chunkIdx` predicate**, so it removes ALL existing chunks for the source across every `chunk_idx` before re-insert. Safe for 1→N and N→M (fewer) — no orphaned stale rows. DELETE + INSERT (`:272`) run inside one `db.transaction` (`:218`) wrapped in `step.run('upsert-embeddings')` (`:217`); a partial failure rolls back BOTH, leaving the prior chunks intact (recoverable, never a permanently-empty index), and Inngest retries (max 2). **Not per-chunk_idx.** ✓
2. **TOCTOU guard — preserved, untouched.** The `business_memory.lastUpdatedAt` `FOR SHARE` re-read + compare-against-`emittedAt` (`embed-memory.ts:220-249`, `.for('share')` :224, compare :236, `EMBED_TOCTOU_STALE` :239) lives in Step 3 (upsert). T1's chunking change is confined to Step 1 (load-and-chunk) and the insert-values mapping; it does not touch the Step 3 guard. ✓
3. **NPM scripts — exist verbatim.** `package.json`: `gate: bash scripts/pre-push-gate.sh`, `eval:run: tsx src/ai/eval/runner.ts`, `test: vitest run`, `lint: eslint`, `typecheck: tsc --noEmit`, `check:banned: node scripts/check-banned-strings.mjs`. All plan references match. (`package.json (seed wiring)` in T2 is a proposed addition, not a claim it exists.) ✓
4. **Adapter + inputType — unchanged.** Voyage stays in its own adapter, explicitly NOT routed through `src/ai/client.ts` (the Anthropic chokepoint) — `voyage.adapter.ts:9-14`. Embed sends `inputType:'document'` (`embed-memory.ts:183` → adapter `:185,262`); retrieve sends `inputType:'query'` (`retrieve.ts:178`). T1 keeps `buildMemoryChunks` feeding the same `voyage.embed({ inputType:'document' })` call site. ✓

---

## Reviewer decisions (job B — baked into the tasks above)

1. **Eval seed:** ONE representative confirmed memory mirroring ClockPay's field shape + the out-of-scope control; deterministic in-repo fixture, NOT a prod pull. → T2 sub-task 1.
2. **currency + customers:** single free-text `z.string()` for both (not array, not union); DB column is `traction` jsonb → no migration. → T4a.
3. **Skeleton:** CSS-only shimmer/pulse, honors `prefers-reduced-motion`, Stone `#ECEAE3` fill via the `bg-stone` token, no JS library. → T4c.
4. **`expectedRetrievableMarker`:** NOT load-bearing this plan — eval gates on grounding pass/reject + cosine separation, plus a validation-time top-hit `chunk_idx`/label log so wrong-chunk matches are visible. Marker-level assertion deferred as **FOLLOWUP-EVAL-MARKER-ASSERTION-01**. → T2 sub-tasks 3, 4, 6.
