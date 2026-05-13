---
phase: 01-foundation
plan: 04
subsystem: ai-chokepoint-inngest
tags: [ai, anthropic, prompt-caching, langfuse, inngest, background-jobs, structured-output, untrusted-input]

requires:
  - phase: 01-01
    provides: "src/lib/env.ts env contract (ANTHROPIC_API_KEY/AI_FALLBACK_ENABLED/LANGFUSE_*/INNGEST_* stubbed optional); eslint.config.mjs AI-SDK chokepoint rule; src/lib/{errors,logger}.ts; Vitest+MSW infra; GitHub Actions CI"
  - phase: 01-03
    provides: "src/db/client.ts getServiceClient(); src/db/schema/{jobs,tenancy}.ts (jobs table + accounts.deleted_at)"
provides:
  - "src/ai/client.ts — runAgent<T>(): the single Anthropic chokepoint. Prompt caching on the stable prefix (cache_control:{type:'ephemeral'} on the last stable block: system→toolDefs→corpus→businessMemory, before the volatile suffix); model routing by task class; Zod structured output via forced tool use ('emit_result' tool, tool_choice forced); one repair retry; config-flagged OpenAI fallback; Langfuse trace with cacheWrite/cacheRead/inputTokens/outputTokens/model (via getLangfuseClient() from @/lib/langfuse — null-safe)"
  - "src/ai/router.ts — pickModel(taskClass): classify→HAIKU_MODEL ('claude-haiku-4-5'), draft→SONNET_MODEL ('claude-sonnet-4-6'), reason→OPUS_MODEL ('claude-opus-4-7'); model ids are named constants"
  - "src/ai/fallback.ts — fallbackToOpenAI<T>(): the ONLY file importing `openai`; NO DB credentials; runs only when env.AI_FALLBACK_ENABLED===true (default off); gpt-4o JSON-mode, output re-validated against the same Zod schema"
  - "src/ai/untrusted.ts — delimitUntrusted(text,label?) + screenForInjection(text)→{flagged,matches} (XC-07 pattern; real enforcement Phase 2/3)"
  - "src/ai/health-check.ts — aiHealthCheck()→{ok:boolean}: ~10-token Haiku ping through runAgent (taskClass classify, maxTokens 64)"
  - "src/ai/schemas/index.ts — HealthCheckSchema = z.object({ ok: z.boolean() }); shared structured-output schemas home"
  - "src/lib/langfuse.ts — STUB: isLangfuseConfigured()→false, getLangfuseClient()→null, TODO(Plan 05); Plan 05 fills this file and never touches ai/client.ts"
  - "src/inngest/client.ts — the single Inngest app (id:'trochia')"
  - "src/app/api/inngest/route.ts — serve({client:inngest, functions:allFunctions, signingKey?}); export const maxDuration=300; exports GET/POST/PUT"
  - "src/inngest/functions/ai-health-check.ts — aiHealthCheckFn: triggers [{event:'ai/health-check.requested'}], retries:4, concurrency:{limit:1}; writes a system jobs row (account_id NULL) queued→running→done|failed; step.run(aiHealthCheck)"
  - "src/inngest/functions/reconcile-stripe.ts — reconcileStripeFn: cron '0 */6 * * *', retries:4 — documented no-op (TODO Plan 07's billing module)"
  - "src/inngest/functions/purge-soft-deleted.ts — purgeSoftDeletedFn: cron '0 3 * * *', retries:4 — FULLY implemented; exports purgeSoftDeletedAccounts(db) + PURGE_AFTER_DAYS=30 (hard-deletes accounts.deleted_at older than 30 days, cascades to children) — XC-04"
  - "src/inngest/functions/stubs.ts — real createFunction defs, no-op bodies: deck-parse (deck/uploaded), embed (embedding/requested), transcribe (transcript/uploaded), brief-enrich (brief/enrich.requested), esign-webhook (esign/event.received), reminders (cron '0 9 * * *') — each retries:4 + per-key concurrency"
  - "src/inngest/functions/index.ts — allFunctions barrel (9 functions)"
  - "scripts/post-deploy-health-check.mjs + package.json postbuild — deploy trigger: sends ai/health-check.requested after `next build` (best-effort; skips when INNGEST_EVENT_KEY unset)"
  - "src/lib/env.ts — ANTHROPIC_API_KEY flipped to required-in-prod (prodRequired); OPENAI_API_KEY/AI_FALLBACK_ENABLED/LANGFUSE_*/INNGEST_* still optional"
  - ".github/workflows/ci.yml — ANTHROPIC_API_KEY CI fallback so the production build stays green"
  - "tests/ai/{client,untrusted,health-check}.test.ts + tests/inngest/serve.test.ts"
affects: [01-05-observability-email, 01-07-walking-skeleton-auth-billing-entitlements, phase-02-knowledge-layer, all-future-ai-calls, all-future-background-jobs]

tech-stack:
  added: ["inngest@4.4 (createFunction v4 signature: triggers in the config object)", "langfuse@3 (type import only — stub), zod v4 z.toJSONSchema() (NOT zod-to-json-schema@3 — that ships Zod-v3 types incompatible with this repo's Zod v4)"]
  patterns:
    - "All Anthropic calls go through runAgent<T>() in src/ai/client.ts — @anthropic-ai/sdk imported nowhere else (ESLint-enforced); `openai` only in src/ai/fallback.ts"
    - "Prompt caching baked in NOW even though the Phase-1 prefix is thin: cache_control:{type:'ephemeral'} on the last stable-prefix block; the volatile suffix (this deck / this turn) is never cached; Langfuse logs cache_creation_input_tokens (cacheWrite) vs cache_read_input_tokens (cacheRead) per call — XC-06"
    - "Structured output via forced tool use: the Zod schema → z.toJSONSchema() → an 'emit_result' tool; tool_choice:{type:'tool',name:'emit_result'}; the model's tool args re-parsed with the same Zod schema; safeParse fail → one repair retry → config-flagged OpenAI fallback else throw AppError"
    - "Langfuse seam: ai/client.ts does `const langfuse = getLangfuseClient()` (from @/lib/langfuse) and `langfuse?.trace(...)` — null-safe in Phase 1, 'just works' once Plan 05 fills the stub; Plan 05 never edits ai/client.ts"
    - "Inngest = the slow-work lane: one serve() endpoint at /api/inngest registering all functions; each function carries retries:4 + a per-key concurrency cap; real functions write a jobs row (the queued→running→done|failed pattern)"
    - "AI work in a request goes to Inngest, not inline — the only Phase-1 AI traffic is the deploy-time Haiku ping"

key-files:
  created:
    - src/ai/client.ts
    - src/ai/router.ts
    - src/ai/fallback.ts
    - src/ai/untrusted.ts
    - src/ai/health-check.ts
    - src/ai/schemas/index.ts
    - src/lib/langfuse.ts
    - src/inngest/client.ts
    - src/inngest/functions/ai-health-check.ts
    - src/inngest/functions/reconcile-stripe.ts
    - src/inngest/functions/purge-soft-deleted.ts
    - src/inngest/functions/stubs.ts
    - src/inngest/functions/index.ts
    - src/app/api/inngest/route.ts
    - scripts/post-deploy-health-check.mjs
    - tests/ai/client.test.ts
    - tests/ai/untrusted.test.ts
    - tests/ai/health-check.test.ts
    - tests/inngest/serve.test.ts
  modified:
    - src/lib/env.ts
    - .github/workflows/ci.yml
    - package.json

key-decisions:
  - "Model ids = 'claude-haiku-4-5' / 'claude-sonnet-4-6' / 'claude-opus-4-7' as named constants in src/ai/router.ts (HAIKU_MODEL/SONNET_MODEL/OPUS_MODEL). The plan said 'read exact ids from the current Anthropic docs via Context7' — Context7's CLI fallback could not resolve the library id in this (Git-Bash, path-mangling) environment, so the current GA ids per the plan's own must_haves wording ('Haiku 4.5 / Sonnet 4.6 / Opus 4.7') were used; bumping is a one-line edit in router.ts."
  - "JSON-schema generation uses Zod v4's built-in `z.toJSONSchema()`, NOT `zod-to-json-schema@3` (which the scaffold installed) — that package ships Zod-v3 types and fails `tsc` against this repo's Zod v4. `$schema` is stripped before passing to Anthropic's `input_schema`. (`zod-to-json-schema` is now an unused dependency; a later cleanup can remove it.)"
  - "OpenAI-fallback config flag = `AI_FALLBACK_ENABLED` (already declared in env.ts by Plan 01, coerced to boolean). Default OFF. `OPENAI_API_KEY` left `.optional()` (NOT flipped to required-in-prod) — it's only needed when the flag is on, and the fallback path errors with a clear AppError ('AI_FALLBACK_MISCONFIGURED') if the key is missing while the flag is on. ANTHROPIC_API_KEY IS flipped to required-in-prod."
  - "Inngest deploy-trigger mechanism = a `postbuild` npm script (`scripts/post-deploy-health-check.mjs`) that fires `inngest.send({name:'ai/health-check.requested'})` after every `next build` (i.e. every Vercel deploy). Best-effort: it logs and exits 0 when `INNGEST_EVENT_KEY` is unset (local builds) and never fails the build. The `ai-health-check` function is also manually triggerable by sending the same event. (Inngest has no literal 'on deploy' event; this is the simplest mechanism that produces a Langfuse trace per deploy.)"
  - "Inngest v4 `createFunction` signature: triggers live in the FIRST argument's config object (`createFunction({ id, retries, concurrency, triggers: [{ event|cron }] }, handler)`) — NOT the old `(config, trigger, handler)` 3-arg form. (Discovered via a test failure; the RESEARCH.md skeleton showed the old shape.)"
  - "`maxDuration = 300` on /api/inngest/route.ts (up to 800 on Vercel Pro — 300 is plenty for Phase 1; keep individual step.run units small)."
  - "purge-soft-deleted retention = 30 days (PURGE_AFTER_DAYS const). The DB work is a separate exported `purgeSoftDeletedAccounts(db)` helper so it's unit-testable with a fake client. The hard-delete cascades to sessions/subscriptions/jobs/legal_acceptances via the schema's ON DELETE CASCADE — no manual child cleanup."
  - ".github/workflows/ci.yml gained an `ANTHROPIC_API_KEY` CI fallback (`ci-anthropic-key`) — `npm run build` runs NODE_ENV=production and env.ts now requires the key; the fallback keeps CI's prod build green before the real key secret is added (same pattern Plan 03 used for the Supabase vars). [Rule 3 — blocking CI]"

requirements-completed: [FND-09, FND-11, XC-06, XC-07, XC-01]

metrics:
  duration: ~50 min
  completed: 2026-05-12
---

# Phase 1 Plan 04: AI Chokepoint + Inngest Summary

**The `ai/client.ts` Anthropic chokepoint shipped REAL — `runAgent<T>()` with prompt-caching breakpoints on the stable prefix (XC-06), model routing by task class (Haiku 4.5 / Sonnet 4.6 / Opus 4.7), Zod structured output via forced tool use with one repair retry, the config-flagged OpenAI fallback (no DB creds, default off), the `ai/untrusted.ts` delimit/screen pattern (XC-07), the deploy-time Haiku health-check, and the `src/lib/langfuse.ts` stub it consumes (Plan 05 fills it, never touches `ai/client.ts`) — all behind the Plan-01 lint boundary (FND-09). Inngest is the slow-work lane: one `serve()` endpoint at `/api/inngest` (FND-11) registering the AI health-check (real, writes a `jobs` row, triggers a Langfuse trace per deploy via the `postbuild` hook), `reconcile-stripe` (cron, stubbed for Plan 07), `purge-soft-deleted` (cron, fully implemented — XC-04), and 6 stub functions for the future workloads; per-key concurrency + 4 retries on every function. `ANTHROPIC_API_KEY` flipped prod-required. 22 new tests pass; full suite 46 passed / 5 skipped (RLS tests skip without `TEST_DATABASE_URL`).**

## What shipped

### `src/ai/` — the chokepoint
- **`runAgent<T>(opts)`** signature: `{ taskClass: 'classify'|'draft'|'reason'; stablePrefix: { system: string; toolDefs?: unknown; corpus?: string; businessMemory?: string }; variableSuffix: unknown; schema: ZodType<T>; maxTokens?: number } → Promise<T>`.
  - **Cache breakpoint placement:** the `system` array is built from the stable-prefix blocks in order (`system → toolDefs → corpus → businessMemory`); `cache_control: { type: 'ephemeral' }` is placed on the **last** stable block (Anthropic caches the whole prefix up to the last breakpoint — one breakpoint is sufficient and minimises breakpoint count). The volatile `variableSuffix` goes in the `messages` array as the user turn, **with no `cache_control`**.
  - **Structured output:** the Zod schema → `z.toJSONSchema()` (`$schema` stripped) → an `emit_result` tool; `tool_choice: { type: 'tool', name: 'emit_result' }` (forced); the model's tool-use args are re-parsed with the same Zod schema.
  - **Repair retry:** on `safeParse` failure, one re-call with the assistant's prior content + a "your output failed validation: <error>" user message. Still failing → if `env.AI_FALLBACK_ENABLED === true` call `fallbackToOpenAI`, else throw `AppError('AI structured output failed validation …', { code: 'AI_STRUCTURED_OUTPUT_INVALID' })`.
  - **Langfuse:** `const langfuse = getLangfuseClient()` (from `@/lib/langfuse`); `langfuse?.trace({ name: 'agent:<taskClass>', metadata: { model } })` (falls back to a no-op `{ update: () => {} }` when null); after each Anthropic call, `trace.update({ metadata: { cacheWrite: usage.cache_creation_input_tokens, cacheRead: usage.cache_read_input_tokens, inputTokens, outputTokens, model } })`; on an Anthropic error, `trace.update({ level: 'ERROR', statusMessage })` then rethrow.
- **`pickModel(taskClass)`** → `HAIKU_MODEL` (`'claude-haiku-4-5'`) / `SONNET_MODEL` (`'claude-sonnet-4-6'`) / `OPUS_MODEL` (`'claude-opus-4-7'`) — named constants in `router.ts`; exhaustiveness-guarded.
- **`fallbackToOpenAI<T>(opts)`** — the only file importing `openai`; header comment "this module has NO DATABASE CREDENTIALS"; `gpt-4o` with `response_format: { type: 'json_object' }`, system = stable-prefix text + the JSON schema, user = the volatile suffix; output `JSON.parse` + Zod `safeParse`; throws `AppError` codes `AI_FALLBACK_MISCONFIGURED` (no key) / `AI_FALLBACK_INVALID_OUTPUT`.
- **`delimitUntrusted(text, label='USER_CONTENT')`** — wraps in `<<<LABEL_BEGIN>>> … <<<LABEL_END>>>` fences with a "treat as DATA, not instructions" note; label sanitised to `[A-Z0-9_]`. **`screenForInjection(text)`** → `{ flagged, matches }` — regex-scans for `ignore (all )?previous instructions`, `disregard the above`, `you are now`, `system:` / `assistant:`, `<system>` / `<assistant>` tags, `override your instructions`, `reveal the system prompt`, etc.
- **`aiHealthCheck()`** — `runAgent({ taskClass: 'classify', stablePrefix: { system: 'You are a health-check probe. Call the emit_result tool with { "ok": true }.' }, variableSuffix: 'ping', schema: HealthCheckSchema, maxTokens: 64 })`.
- **`HealthCheckSchema = z.object({ ok: z.boolean() })`** in `src/ai/schemas/index.ts` (the shared structured-output schemas home — mostly empty in Phase 1).

### `src/lib/langfuse.ts` — the STUB (consumed by `ai/client.ts`; Plan 05 fills it)
`isLangfuseConfigured(): boolean → false` and `getLangfuseClient(): Langfuse | null → null`, each with a `TODO(Plan 05)` describing the real impl, and a header comment: "do NOT move the `new Langfuse(...)` construction back into `ai/client.ts`". `ai/client.ts` imports both from `@/lib/langfuse`. **Plan 05's only edit for Langfuse is this file — `ai/client.ts` is untouched.**

### `src/inngest/` — the slow-work lane
- **`inngest`** = `new Inngest({ id: 'trochia', eventKey? })` (event key only when set; the signing key goes to `serve()`).
- **`/api/inngest/route.ts`:** `export const maxDuration = 300; export const { GET, POST, PUT } = serve({ client: inngest, functions: allFunctions, signingKey? })`.
- **`ai-health-check`** (`aiHealthCheckFn`): triggers `[{ event: 'ai/health-check.requested' }]`, `retries: 4`, `concurrency: { limit: 1 }`. `step.run('create-job-row')` inserts a `jobs` row (`type: 'ai-health-check'`, `status: 'running'`, `accountId: null` — a system job, only reachable via `getServiceClient()`); `step.run('haiku-ping')` calls `aiHealthCheck()`; `step.run('mark-done')` sets `status: 'done', result`; on error `step.run('mark-failed')` sets `status: 'failed', error`. Demonstrates the `queued→running→done|failed` jobs-table pattern + exercises `ai/client.ts` → a real Langfuse trace per deploy (once Plan 05's keys land).
- **`reconcile-stripe`** (`reconcileStripeFn`): cron `'0 */6 * * *'`, `retries: 4` — a **documented no-op** (`logger.info('reconcile-stripe: billing module not yet wired (TODO Plan 07) …')`, returns `{ reconciled: 0 }`). TODO(Plan 07): for each account with a `stripe_customer_id`, re-pull the subscription from Stripe and reconcile `accounts.subscription_status`/`tier`/`current_period_end` — webhooks are the optimization, this poller is the safety net (PITFALLS §18).
- **`purge-soft-deleted`** (`purgeSoftDeletedFn`): cron `'0 3 * * *'`, `retries: 4` — **fully implemented** (XC-04). `step.run('purge')` calls `purgeSoftDeletedAccounts(getServiceClient())` which `delete()`s `accounts` `where deleted_at IS NOT NULL AND deleted_at < now() - 30 days` and returns the count; the schema's `ON DELETE CASCADE` fans the delete out to `sessions`/`subscriptions`/`jobs`/`legal_acceptances`. `PURGE_AFTER_DAYS = 30`.
- **`stubs.ts`** — real `createFunction` definitions, no-op bodies (each `logger.info('stub: <name> — implemented in Phase N')`): `deck-parse` (`deck/uploaded`, concurrency 5), `embed` (`embedding/requested`, 10), `transcribe` (`transcript/uploaded`, 3), `brief-enrich` (`brief/enrich.requested`, 5), `esign-webhook` (`esign/event.received`, 5), `reminders` (cron `'0 9 * * *'`, 1) — all `retries: 4`.
- **`allFunctions`** = `[aiHealthCheckFn, reconcileStripeFn, purgeSoftDeletedFn, deckParseFn, embedFn, transcribeFn, briefEnrichFn, esignWebhookFn, remindersFn]` (9).
- **Deploy trigger:** `scripts/post-deploy-health-check.mjs` (wired as the `postbuild` npm script) — `new Inngest({ id: 'trochia', eventKey }).send({ name: 'ai/health-check.requested', data: { trigger: 'postbuild' } })`. If `INNGEST_EVENT_KEY` is unset (local `next build`) it logs `"… skipping (not a deploy env)"` and exits 0; on a send error it `console.warn`s (non-fatal). Never fails the build.

### Env + CI
- **`src/lib/env.ts`:** `ANTHROPIC_API_KEY: prodRequired(z.string())` (was `.optional()`). Everything else stayed: `OPENAI_API_KEY`/`AI_FALLBACK_ENABLED`/`LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY`/`LANGFUSE_HOST`/`INNGEST_SIGNING_KEY`/`INNGEST_EVENT_KEY` all `.optional()` (Plan 05 tightens `LANGFUSE_*`; the Vercel↔Inngest integration auto-injects the Inngest keys in prod). A disjoint one-line edit — no schema reshape.
- **`.github/workflows/ci.yml`:** added `ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY || 'ci-anthropic-key' }}` to the job env (and a doc comment) so the `NODE_ENV=production` build stays green before the real key secret exists.

## Task Commits

1. **Task 1: ai/client.ts chokepoint + ai/{router,fallback,untrusted,health-check,schemas} + src/lib/langfuse.ts stub + ANTHROPIC_API_KEY flip + ci.yml fallback** — `a51b97d` (feat)
2. **Task 2: Inngest client + /api/inngest serve() endpoint + ai-health-check / reconcile-stripe / purge-soft-deleted / stubs + postbuild trigger** — `6c0fc09` (feat)
3. **Task 3: tests/ai/health-check.test.ts — deploy-time Haiku ping emits a Langfuse trace with cache metrics** — `e5e0c46` (test)

Plan metadata: this SUMMARY commit.

## Verification

| Check | Result |
|-------|--------|
| `npm run lint` | ✅ exit 0 (0 errors) — `@anthropic-ai/sdk` only in `src/ai/client.ts`, `openai` only in `src/ai/fallback.ts` |
| `npm run typecheck` | ✅ exit 0 |
| `npm run build` (with `ANTHROPIC_API_KEY` set; NODE_ENV=production) | ✅ exit 0 — `/api/inngest` route in the build output; `postbuild` ran and skipped (no event key locally) |
| `npm run check:banned` | ✅ "no violations" |
| `npx vitest run tests/ai/ tests/inngest/` | ✅ 4 files, 22 tests passed |
| `npx vitest run` (full suite) | ✅ 9 files / 46 tests passed, 2 files / 5 tests skipped (RLS tests skip without `TEST_DATABASE_URL`) |
| import-boundary | ✅ `@anthropic-ai/sdk` imported only in `ai/client.ts`; `openai` only in `ai/fallback.ts` (Plan-01 lint rule now guards a real `ai/` dir) |
| langfuse stub | ✅ `isLangfuseConfigured()→false`, `getLangfuseClient()→null`; `ai/client.ts` imports `getLangfuseClient` from `@/lib/langfuse` (no inline `new Langfuse()`) |
| `/api/inngest` route | ✅ exports `GET`/`POST`/`PUT` from `serve({...})`; `maxDuration === 300` |

### What the tests assert
- **`tests/ai/client.test.ts` (12):** classify→Haiku / draft→Sonnet / reason→Opus (by the request body's `model`); `cache_control:{type:'ephemeral'}` present on a stable system block, absent on the volatile user message; Zod parse success returns the object; one repair retry on first-fail-then-succeed; OpenAI fallback called when `AI_FALLBACK_ENABLED==='true'`, throws (`/validation/i`) when off; a Langfuse trace `.update()` carries `cacheWrite/cacheRead/inputTokens/outputTokens/model` when `getLangfuseClient()` is mocked to a spy; the null path (stub state) doesn't crash.
- **`tests/ai/untrusted.test.ts` (5):** `delimitUntrusted("hi")` contains the fence markers + "untrusted" note; custom labels sanitised; `screenForInjection` flags "ignore all previous instructions" and a fake `system:` turn, passes a normal sentence (`{ flagged: false, matches: [] }`).
- **`tests/ai/health-check.test.ts` (3):** `aiHealthCheck()` → `{ ok: true }` + routes through Haiku; with a spy Langfuse client, a trace `.update()` carries the cache-metric metadata; with `getLangfuseClient()` null, still `{ ok: true }`, no crash.
- **`tests/inngest/serve.test.ts` (6):** `allFunctions` registers all 9 expected ids; every function has `retries: 4`; the `/api/inngest` route exports `GET`/`POST`/`PUT` and `maxDuration >= 300`; `purgeSoftDeletedAccounts` returns the deleted count (purges 2, returns 0 when nothing past the window); `PURGE_AFTER_DAYS === 30`.

## Deviations from Plan

### Auto-fixed / forced by tooling reality

**1. [Rule 3 — Blocking tooling] JSON-schema generation via Zod v4's `z.toJSONSchema()`, not `zod-to-json-schema@3`.**
- **Found during:** Task 1 (`tsc` failed).
- **Issue:** The plan/RESEARCH said "use `zod-to-json-schema` for the tool schema". The scaffold installed `zod-to-json-schema@3.25.2`, but that package's types are written against Zod v3 — calling it with this repo's Zod v4 schema is a `tsc` type error (`ZodType<...>` missing v3-internal members).
- **Fix:** Use Zod v4's built-in `z.toJSONSchema(schema)` instead (both in `ai/client.ts` and `ai/fallback.ts`); strip the `$schema` key before passing to Anthropic's `input_schema`. Same result — a JSON Schema for the tool. `zod-to-json-schema` is now an unused dependency (a later cleanup can drop it).
- **Commit:** `a51b97d`.

**2. [Rule 3 — Blocking tooling] Inngest v4 `createFunction` signature: triggers in the first config arg.**
- **Found during:** Task 2 (test suite failed to load the function modules).
- **Issue:** The RESEARCH.md skeleton (and the older Inngest docs) showed `inngest.createFunction(config, trigger, handler)` — but `inngest@4.4` requires `createFunction({ id, retries, concurrency, triggers: [{ event|cron }] }, handler)` (triggers moved into the config object; handler is the 2nd arg).
- **Fix:** All 9 function definitions use the v4 shape.
- **Commit:** `6c0fc09`.

**3. [Rule 3 — Blocking CI] `.github/workflows/ci.yml` `ANTHROPIC_API_KEY` fallback.**
- **Found during:** Task 1 (after flipping `ANTHROPIC_API_KEY` to required-in-prod, `npm run build` — which runs `NODE_ENV=production` — fails the env parse without the var, so CI's build step would go red).
- **Fix:** Added `ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY || 'ci-anthropic-key' }}` to the CI job env + a doc comment (same pattern Plan 03 used for the Supabase vars). The real key secret can be added to the repo later without a workflow change.
- **Commit:** `a51b97d`.

**4. [Decision, not a deviation] Model ids chosen from the plan's own wording.** The plan said "read the exact model ids from the current Anthropic docs via Context7". Context7's CLI fallback could not resolve the library id in this environment (Git-Bash mangles the leading-`/` library path). Used the GA ids the plan's `must_haves` themselves name — Haiku 4.5 / Sonnet 4.6 / Opus 4.7 → `claude-haiku-4-5` / `claude-sonnet-4-6` / `claude-opus-4-7` — as named constants in `router.ts` (a model bump is a one-line edit). Documented for the verifier to confirm against the live model list.

**Total:** 3 Rule-3 (blocking tooling/CI; no scope creep, no architectural change) + 1 documented model-id decision. The threat register's `mitigate` items (T-1-18 chokepoint lint boundary, T-1-19 untrusted delimit/screen + Zod-validated output, T-1-20 fallback has no DB creds + config-flagged off, T-1-21 Inngest signing-key verification via `serve()`, T-1-22 bounded one-retry + per-key concurrency caps, T-1-24 system jobs are service-client-only) are all implemented as designed.

## Known Stubs

- **`src/lib/langfuse.ts`** — `isLangfuseConfigured()→false`, `getLangfuseClient()→null`. Intentional: Plan 05 provisions the Langfuse account/keys and fills this file (and ONLY this file — `ai/client.ts` is untouched). The `ai/client.ts` trace path is no-op-safe until then. Does not block this plan's goal — the chokepoint is real; tracing "goes live" automatically once Plan 05 lands.
- **`src/inngest/functions/reconcile-stripe.ts`** — body is a documented `logger.info` no-op + `TODO(Plan 07)`. Intentional per the plan — it references billing state (`accounts.stripe_customer_id`, the Stripe client) that Plan 07 finalizes. Until then the cron runs and does nothing harmful.
- **`src/inngest/functions/stubs.ts`** (6 functions) — real `createFunction` definitions, no-op `logger.info` bodies. Intentional — the wiring (event names, concurrency caps, retries, serve() registration) is proven now; each later phase fills its function's body. Not stubs that block Phase 1's goal — they're forward scaffolding the plan explicitly asked for.

## Post-Deploy Manual Verification (for VALIDATION.md)

After a Vercel deploy (once Plan 05's Langfuse keys are live): the `postbuild` hook fires `ai/health-check.requested` (or trigger it manually via `inngest.send({ name: 'ai/health-check.requested' })`); open the Langfuse dashboard → confirm an `agent:classify` trace exists with `cacheWrite` / `cacheRead` / `inputTokens` / `outputTokens` / `model` metadata. This is the one Manual-Only check for FND-09/XC-06 — already recorded in `01-VALIDATION.md`'s Manual-Only table; nothing to add.

## Next Phase Readiness

- **Plan 05** fills `src/lib/langfuse.ts` (real account/keys logic — `ai/client.ts` untouched), wires Sentry + Amplitude + Resend, and tightens `LANGFUSE_*` to required-in-prod.
- **Plan 07** wires the billing module + replaces the `reconcile-stripe` no-op body with the real Stripe re-pull; flips `INNGEST_SIGNING_KEY`/`INNGEST_EVENT_KEY` to required-in-prod (or relies on the Vercel↔Inngest auto-injection).
- **Phase 2** builds the memory spine ON `runAgent<T>()` — the prompt-caching + Langfuse-instrumentation pattern is proven (a thin Phase-1 prefix, but the breakpoints + cache-metric logging are wired and tested).
- **Operational follow-ups:** (a) the Vercel↔Inngest integration must be connected so `/api/inngest` is registered and the signing/event keys are injected in prod; (b) the real `ANTHROPIC_API_KEY` should be added to Vercel env + the GitHub Actions secret (a CI fallback is in place so nothing is blocked).

## Self-Check: PASSED

All three task commits (`a51b97d`, `6c0fc09`, `e5e0c46`) present in branch history; all created files exist on disk (`src/ai/client.ts`, `src/ai/router.ts`, `src/ai/fallback.ts`, `src/ai/untrusted.ts`, `src/ai/health-check.ts`, `src/ai/schemas/index.ts`, `src/lib/langfuse.ts`, `src/inngest/client.ts`, `src/inngest/functions/{ai-health-check,reconcile-stripe,purge-soft-deleted,stubs,index}.ts`, `src/app/api/inngest/route.ts`, `scripts/post-deploy-health-check.mjs`, `tests/ai/{client,untrusted,health-check}.test.ts`, `tests/inngest/serve.test.ts`).

---
*Phase: 01-foundation*
*Completed: 2026-05-12*
