# LANGFUSE-TRACING-01 — Fix Plan

**Branch:** `feat/langfuse-tracing` (off main @ 35c5961)
**Status:** PLAN ONLY — no implementation. STOP for founder + review.
**Date:** 2026-06-15

## Problem

The Langfuse seam is wired (`src/lib/langfuse.ts`) but the tracing is the minimal
"Plan 05" stub. Four gaps:

1. **No flush (CRITICAL).** The langfuse Node SDK batches events and flushes on a
   timer. In serverless (Vercel functions, Inngest steps) and short-lived scripts
   (the deploy health-check, the eval), the process freezes/exits before the timer
   fires, so **traces are produced but never delivered**. Net effect on prod: zero
   `agent:*` traces in Langfuse, which is exactly why the nightly `cache-hit` check
   finds "no agent:* traces in the 7d window."
2. **Claude calls are logged as trace *metadata*, not generation observations.**
   `runAgent` does `trace.update({ metadata: { cacheWrite, cacheRead, inputTokens,
   outputTokens, model } })`. There is no `generation()` observation with `model` +
   token usage, so Langfuse computes **no automatic cost** for any Claude call.
3. **No `userId`** on traces, although `accountId` is available
   (`runAgent` opts.costContext.accountId; voyage `input.trace.accountId`).
4. **`cache-hit` reds the nightly on no-data.** `cache-hit` correctly self-skips
   when there are zero `agent:*` traces (data-unavailable), but the runner promotes
   ANY `skip` to a failure under `EVAL_LIVE_REQUIRED=1`. A brand-new project, an
   empty 7d window, or Langfuse ingestion lag therefore reds a run that has no real
   regression.

## Verified Langfuse API (`langfuse@3.38.20`, `langfuse-core` types)

Read from `node_modules/langfuse-core/lib/index.d.ts`. NOT from memory.

- **`client.trace(body)` → `LangfuseTraceClient`.** body `CreateLangfuseTraceBody`:
  `name?`, **`userId?: string | null`** (trace-level, NOT generation), `metadata?`,
  `input?`, `output?`, `sessionId?`, `tags?`, `version?`.
- **`traceClient.generation(body)` → `LangfuseGenerationClient`** (line 7560).
  body = `Omit<CreateLangfuseGenerationBody, "traceId" | "parentObservationId" |
  "promptName" | "promptVersion"> & PromptInput`. Usable fields (via
  CreateGenerationBody → CreateSpanBody → OptionalObservationBody):
  `name?`, `model?: string | null`, `modelParameters?`, `input?`, `output?`,
  `metadata?`, `startTime?`, `endTime?`, `completionStartTime?`, `level?`,
  `statusMessage?`, **`usageDetails?: Record<string, number>`** (modern),
  `costDetails?: Record<string, number>`, `usage?` (deprecated, see below).
- **Usage — modern (USE THIS): `usageDetails: Record<string, number>`.** Keys are
  usage-metric names; a `total` key, if present, is the sum. Langfuse computes cost
  server-side from the generation's `model` + these metric names against its model
  price table.
- **Usage — deprecated `usage`:** `{ input?: number, output?: number, total?: number,
  unit?: ModelUsageUnit }` OR OpenAI-style `{ promptTokens, completionTokens,
  totalTokens }`. `ModelUsageUnit = "TOKENS" | "CHARACTERS" | "MILLISECONDS" |
  "SECONDS" | "IMAGES" | "REQUESTS"`. We will NOT use this; `usageDetails` is the
  current path.
- **Flush: `client.flushAsync(): Promise<void>`** (line 7433) — await in serverless /
  scripts. `flush(cb?)` (7434) is fire-and-forget; do not use it where we need
  delivery before the process exits.

### Anthropic cache-token → usageDetails mapping (VERIFY-BEFORE-CODING)

Anthropic `message.usage` returns `input_tokens`, `output_tokens`,
`cache_creation_input_tokens`, `cache_read_input_tokens`. The SDK type only
guarantees `usageDetails: Record<string, number>`; the cost mapping is a Langfuse
server-side concern keyed on the model name + metric-key names. **Candidate mapping
(confirm against the Langfuse Anthropic model definitions / docs at implementation
time — this is the one thing not pinned by the .d.ts):**

```ts
usageDetails: {
  input: res.usage.input_tokens,                                  // non-cached input
  output: res.usage.output_tokens,
  cache_read_input_tokens: res.usage.cache_read_input_tokens ?? 0,
  cache_creation_input_tokens: res.usage.cache_creation_input_tokens ?? 0,
}
```

The generation `model` MUST be the same model string `pickModel(taskClass)` returns
(e.g. `claude-haiku-4-5`) for Langfuse to match a price row. If auto-cost does not
resolve for our exact model ids, the fallback is to attach `costDetails` computed
from `src/ai/cost/rates.ts` (we already price Anthropic there) — record this as the
contingency, not the default.

## Hard contracts to preserve (each confirmed)

1. **`cache-hit` reads TRACE metadata, not observations.**
   `src/ai/eval/checks/cache-hit.ts:83` uses `client.fetchTraces({ fields:'core,io' })`
   and reads `trace.metadata.cacheRead` / `trace.metadata.inputTokens` off
   `agent:*`-named traces (`AGENT_NAME_PREFIX='agent:'`, line 45). → **KEEP the trace
   name `agent:${taskClass}` and KEEP the existing `trace.update({ metadata: {
   cacheRead, inputTokens, cacheWrite, outputTokens, model } })`.** The generation
   observation is **ADDITIVE** — it does not replace the trace metadata. (If trace
   metadata moved to the generation, cache-hit would have to switch to
   `fetchObservations` — explicitly out of scope, C1-H2/OD-3.)
2. **Privacy — static error string.** `tests/ai/client.test.ts:181-222` pins that on
   an Anthropic error the trace `statusMessage` is the STATIC `"anthropic request
   failed (status N)"` and the provider body/message NEVER reaches any trace call.
   → The new generation must NOT carry raw `input`/`output`; on error it must not
   echo the provider body either.
3. **Privacy — untrusted/PII in `variableSuffix`.** Trochia CLAUDE.md: uploaded
   decks/transcripts/paste live in `variableSuffix`. → **Do NOT set generation
   `input`/`output` to the raw prompt/response.** Omit them (or set a whitelisted,
   token-count-only metadata, mirroring `voyage.adapter.ts`'s `buildTraceMetadata`).
   The generation carries `model` + `usageDetails` + safe metadata only.
4. **ESLint chokepoint rule.** Only `src/ai/client.ts` imports `@anthropic-ai/sdk`.
   → All changes that touch Anthropic usage stay in `client.ts`; `langfuse.ts` gets
   only the flush helper. No new `@anthropic-ai/sdk` import anywhere.
5. **Strict prod env validation stays.** No change to `src/lib/env.ts` LANGFUSE_*
   schema. (`LANGFUSE_HOST` remains `prodRequired(z.string().url())`.)

## File-by-file changes

### 1. `src/lib/langfuse.ts` — add the flush helper (additive)
```ts
/** Deliver any buffered events before a serverless freeze / script exit. Null-safe. */
export async function flushTracing(): Promise<void> {
  const c = getLangfuseClient();
  if (c) await c.flushAsync();
}
```
No change to `isLangfuseConfigured` / `getLangfuseClient`.

### 2. `src/ai/client.ts` — additive generation + userId, metadata preserved
- Extend the local `TraceLike` interface so the handle also exposes
  `generation(body): unknown` (additive; `update` stays). Extend `NOOP_TRACE` to
  `generation: () => NOOP_GENERATION` where `NOOP_GENERATION = { update(){}, end(){} }`
  (null-safe no-ops so the Phase-1 stub path and the `getLangfuseClient()===null`
  path never throw — preserves `client.test.ts:224`).
- Add `userId` to the trace open call:
  `trace = langfuse?.trace({ name: \`agent:${opts.taskClass}\`,
  userId: opts.costContext?.accountId, metadata: { model } }) ?? NOOP_TRACE`.
  (accountId is the tenant id; it is not PII and is the natural Langfuse userId.)
- **KEEP** both existing `trace.update({ metadata: { cacheWrite, cacheRead,
  inputTokens, outputTokens, model[, repair] } })` calls verbatim (cache-hit
  depends on them).
- **ADD**, after each attempt, a generation observation for auto-cost:
  ```ts
  trace.generation({
    name: 'anthropic.messages',
    model,                                   // same string pickModel returns
    usageDetails: {
      input: res.usage.input_tokens,
      output: res.usage.output_tokens,
      cache_read_input_tokens: res.usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: res.usage.cache_creation_input_tokens ?? 0,
    },
    metadata: { repair: <bool> },            // safe flags only — NO input/output
  });
  ```
  No `input`/`output` fields (privacy contract 3). On the error path, do NOT add a
  generation that carries the provider body; keep the existing static
  `trace.update({ level:'ERROR', statusMessage })` (contract 2).
- **Flush decision for `client.ts`:** do NOT flush per-call (kills batching). Flush is
  the caller's responsibility at the serverless boundary (below). Document this in the
  `runAgent` header.

### 3. Flush at the serverless / script boundaries (delivery — the critical gap)
Call `await flushTracing()` after agent work completes, in each short-lived context:
- **`src/inngest/functions/ai-health-check.ts`** — MUST-HAVE. The deploy-time Haiku
  ping (`src/ai/health-check.ts` → `runHealthCheck` → `runAgent`) is the guaranteed
  producer of the first `agent:*` trace; flushing here is what lands a trace in the
  7d window on every deploy, closing the nightly `cache-hit` no-data gap at the
  source.
- **`src/inngest/functions/embed-memory.ts`** and any other Inngest fn that invokes an
  agent — flush at the end of the step.
- **tRPC procedures that call `runAgent`** (`src/server/routers/memory.ts`,
  `src/server/routers/qa.ts`) — flush in a `finally` before the resolver returns.
  (Confirm exact call sites during implementation; the pattern is the same:
  `try { ...agent... } finally { await flushTracing(); }`.)
- Keep each flush null-safe (no Langfuse creds → `flushTracing()` is a no-op).

### 4. `src/ai/eval/types.ts` — discriminate skip cause (additive, optional field)
Add an optional discriminator so the runner can tell "creds absent" from "no data":
```ts
export type SkipKind = 'env-unavailable' | 'data-unavailable';
export type EvalCheckResult = {
  // ...existing fields unchanged...
  skipKind?: SkipKind;   // only meaningful when status === 'skip'
};
```
Optional → no existing result object breaks.

### 5. `src/ai/eval/checks/cache-hit.ts` — tag skip cause + absorb ingestion lag
- Tag the existing skip branches:
  - `!isLangfuseConfigured()` and `client === null` → `skipKind: 'env-unavailable'`.
  - `counted === 0` (and the `Array.isArray` fallthrough) → `skipKind: 'data-unavailable'`.
- **Ingestion-lag tolerance (live only):** when `EVAL_LIVE_REQUIRED==='1'` and the
  first `fetchTraces` returns `counted === 0`, retry the fetch with a small bounded
  backoff (e.g. up to 2 extra tries, ~5s apart) before concluding data-unavailable —
  Langfuse ingestion can lag the producer by seconds. Cap total added wait at ~15s.
  Read window + whitelist unchanged. (No raw input/output read — contract 1/privacy.)

### 6. `src/ai/eval/runner.ts` — only env-unavailable skips red a live run
Change the live-skip rule so a data-unavailable skip is tolerated:
```ts
const liveSkipFail =
  liveRequired &&
  results.some((r) => r.status === 'skip' && r.skipKind !== 'data-unavailable');
```
A `data-unavailable` skip stays a non-fatal skip (logged in the summary). An
`env-unavailable` skip (missing LANGFUSE/ANTHROPIC creds) still reds the live run —
the original C1-H1 intent is preserved.

> NOTE (separate from this fix): the current nightly also reds because
> `ANTHROPIC_API_KEY` is unset in the LIVE eval step (extraction-floor + qa-grounding
> skip as `env-unavailable`). That is a **secrets** action, not code — out of scope
> here, but the live run will not go green until that secret is set. This plan makes
> the cache-hit no-data case graceful; it does NOT (and must not) mask missing creds.

## Test updates (additive — no weakened assertions)

### `tests/ai/client.test.ts`
- `makeSpyLangfuse()` currently returns `trace: vi.fn(() => ({ update }))`. **Add a
  `generation` mock** to the returned handle: `{ update: traceUpdate, generation:
  generationSpy }`, where `generationSpy` returns a no-op `{ update(){}, end(){} }`.
  Without this, the new `trace.generation(...)` call throws in the existing tests.
- **KEEP** the existing assertions: the cache-metric `traceUpdate` metadata
  (`cacheWrite/cacheRead/inputTokens/outputTokens/model`), the static-error-string
  privacy assertion, and the null-client no-crash test — all unchanged.
- **ADD** assertions:
  - generation called with `model` matching the routed model and `usageDetails`
    carrying the four token counts (250 cacheWrite / 30 cacheRead / 42 input / 7
    output from the existing fixture).
  - **Privacy extension:** the SENSITIVE sentinel never appears in ANY generation
    call args either (extend the existing `JSON.stringify(...calls)` sweep to include
    the generation spy). Pins contract 3 (no raw input/output on the generation).
  - trace opened with `userId` = the costContext accountId when present.

### `tests/ai/eval/runner.test.ts`
- Add a case: a result with `status:'skip', skipKind:'data-unavailable'` under
  `EVAL_LIVE_REQUIRED='1'` → exitCode 0 (tolerated); a `status:'skip',
  skipKind:'env-unavailable'` under live-required → exitCode 1 (still reds).

### cache-hit unit coverage
- If a cache-hit unit test exists, add: zero-trace fetch → `status:'skip',
  skipKind:'data-unavailable'`; unconfigured → `skipKind:'env-unavailable'`. Keep the
  whitelist assertion (only metadata token counts read, never input/output).

## Verification

1. `npm run typecheck` — TraceLike/generation types, optional skipKind, runner.
2. `npm run lint` — confirm the chokepoint rule still passes (no new
   `@anthropic-ai/sdk` import; only `client.ts`).
3. `npm run test` (vitest) — full suite green, INCLUDING:
   - the client.test.ts privacy assertions (static error string + SENSITIVE absent
     from trace AND generation args),
   - the new generation/userId assertions,
   - the runner skipKind cases.
4. `npm run gate` — must load `.env.test` (NOT prod `xnzyhjwalphcykjwoxdw` / not
   `.env.local`); banned + em-dash clean.
5. **Live Eval Harness re-run** (`gh workflow run "Eval Harness" --ref main` after
   merge, once `ANTHROPIC_API_KEY` + the three `LANGFUSE_*` secrets are set): expect
   the deploy health-check to produce + FLUSH an `agent:*` trace, and `cache-hit` to
   move from `skip (no data)` toward `pass` (cache-read ratio > 0) once a cached call
   has run; in the interim, a `data-unavailable` skip no longer reds the run.

## Scope / risks / open questions

- **OUT OF SCOPE:** moving cache metrics from trace metadata to observations;
  changing `fetchTraces`→`fetchObservations`; the `ANTHROPIC_API_KEY` secret (ops);
  any `env.ts` schema change.
- **RISK — auto-cost key names.** If Langfuse does not cost-map our exact Claude model
  ids via `usageDetails`, cost will read 0. Mitigation: confirm the Anthropic
  usageDetails keys + model match against Langfuse docs/model table BEFORE coding; if
  unresolved, attach `costDetails` from `src/ai/cost/rates.ts` as the contingency.
- **RISK — per-request flush latency.** `flushAsync()` adds a network round-trip at
  the serverless boundary. Acceptable for Inngest/background and the health-check; for
  hot tRPC paths, confirm it runs in `finally` after the response value is computed so
  it does not block the user-visible result (or consider `waitUntil` if available).
- **OPEN QUESTION (founder):** set `userId` to the raw `accountId` (tenant id), or a
  hashed/opaque id? accountId is an internal UUID, not PII, so raw is acceptable and
  most useful for per-tenant cost views — confirm.
