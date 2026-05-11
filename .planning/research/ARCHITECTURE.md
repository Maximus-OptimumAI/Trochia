# Architecture Research

**Domain:** Agentic founder-fundraising operating system (multi-tenant SaaS — Next.js 15 monolith, Supabase Postgres/pgvector, tRPC + Drizzle, Inngest, Anthropic API)
**Researched:** 2026-05-11
**Confidence:** HIGH on the platform patterns (Next.js/tRPC/Drizzle/Supabase RLS/Inngest are well-trodden and verified against current docs); MEDIUM on the AI-orchestration and eval-harness specifics (training-data + Context7 + Build Stack doc, not yet validated against a running system); HIGH on the deterministic-vs-LLM boundary (it is a stated non-negotiable in PROJECT.md / PRD §12, not a judgment call).

---

## Standard Architecture

Trochia is **one Next.js 15 monolith** (App Router) on Vercel, fronting **Supabase Postgres** (with `pgvector`, Storage, Auth). It is organized as **layered modules inside one repo** — not microservices. The seam that matters is not network boundaries; it is the **package/module boundary inside `src/`** plus the **trust boundary at RLS**. Get those two seams right and the monolith holds from MVP through V3.

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  CLIENT — Next.js App Router (RSC + client components, shadcn/ui)              │
│  marketing site (same repo)  |  app shell  |  ambient Q&A sidebar (every page) │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │ tRPC (typed, Zod-validated)            │ Supabase JS (auth, storage signed URLs)
┌───────────────┴──────────────────────────────────────────────────────────────┐
│  API / EDGE — Next.js Route Handlers + tRPC routers (runs on Vercel)          │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  context builder: session → tenant_id → request-scoped Drizzle client   │  │  ← the tenant-scoping seam
│  └────────────────────────────────────────────────────────────────────────┘  │
│  webhooks: Stripe · Dropbox Sign · Inngest · Supabase Auth hooks              │
└───────┬───────────────────────┬───────────────────────────┬───────────────────┘
        │                       │                           │
┌───────┴────────┐  ┌───────────┴───────────┐  ┌────────────┴────────────────┐
│ DOMAIN MODULES │  │  AI ORCHESTRATION     │  │  INTEGRATION ADAPTERS       │
│ (pure-ish TS)  │  │  LAYER (`/ai`)        │  │  (`/integrations`)          │
│ knowledge      │  │  agents: deck-review, │  │  GmailAdapter (send,        │
│ pitch-lab      │  │  brief-gen, follow-up,│  │   founder-approved)         │
│ investor-pipe  │  │  app-answers, scoring,│  │  CalendarAdapter            │
│ live-raise     │  │  q&a-rag, q&a-drill   │  │  DriveAdapter (drive.file)  │
│ data-room      │  │  - structured-output  │  │  TranscriptImportAdapter    │
│ legal-stack    │  │    schemas (Zod)      │  │   (Granola/Otter/paste)     │
│ raise-ops ─────┼──┤  - prompt-cache mgr   │  │  ESignAdapter (DropboxSign/ │
│  ├ safe-gen    │  │  - model router       │  │   DocuSign)                 │
│  ├ cap-table ◄─┼──┼── (NO LLM — pure math)│  │  EnrichmentAdapter (Exa/    │
│  ├ ff-manager  │  │  - eval harness (sep) │  │   Firecrawl/Apify/Harmonic) │
│  └ e-sign      │  │  - OpenAI/Codex fbk   │  │  DeckParseAdapter (LlamaParse)│
│ billing/entitle│  │                       │  │  TranscribeAdapter (Deepgram)│
└───────┬────────┘  └───────────┬───────────┘  └────────────┬────────────────┘
        │                       │                           │
┌───────┴───────────────────────┴───────────────────────────┴───────────────────┐
│  BACKGROUND JOBS — Inngest (event-driven, retries, fan-out, step memoization)  │
│  deck.uploaded → parse → embed → review     transcript.received → parse → embed │
│  memory.confirmed → embed                   esign.envelope.* (webhook → fn)    │
│  brief.requested → enrich → synthesize      pipeline reminders (cron)           │
└───────┬───────────────────────────────────────────────────────────────────────┘
        │
┌───────┴───────────────────────────────────────────────────────────────────────┐
│  DATA — Supabase Postgres (one project per region: US, UK*, IN; EU at V2)      │
│  ┌─────────────┐ ┌──────────────┐ ┌────────────┐ ┌──────────────┐ ┌─────────┐ │
│  │ tenant data │ │ memory tables│ │ pgvector   │ │ shared corpus│ │ Storage │ │
│  │ (RLS on all)│ │ business +   │ │ embeddings │ │ (no tenant — │ │ decks,  │ │
│  │             │ │ pipeline mem │ │ (tenant +  │ │  curated     │ │ audio,  │ │
│  │             │ │              │ │  corpus)   │ │  fundraising)│ │ SAFEs   │ │
│  └─────────────┘ └──────────────┘ └────────────┘ └──────────────┘ └─────────┘ │
│  Upstash Redis: rate limiting, prompt-cache bookkeeping, hot reads             │
└────────────────────────────────────────────────────────────────────────────────┘
   * UK and US can be the same Supabase region at MVP (US-East) if UK founders accept
     US residency contractually; promote UK to a dedicated EU/UK region with the EU push at V2.
```

### Component Responsibilities

| Component | Responsibility (what it owns) | Typical Implementation |
|-----------|-------------------------------|------------------------|
| **App shell + RSC pages** | Routing, layout, ambient Q&A sidebar, auth-gated navigation, marketing site | Next.js 15 App Router; shadcn/ui; TanStack Query for client state; Server Components fetch via tRPC server caller |
| **tRPC routers** | The *only* write path into the DB from the client. Zod-validate input, enforce tenant scope, call domain services | One router per module (`knowledgeRouter`, `pitchLabRouter`, …) merged into `appRouter`; protected procedures inject `ctx.tenantId` |
| **Context builder** | Resolve Supabase session → `user_id` → `tenant_id` (= business id); construct a **request-scoped Drizzle client** that runs queries as the authenticated Postgres role so RLS applies | `createTRPCContext` reads the Supabase JWT; for RLS-enforced reads use a connection that sets `request.jwt.claims` / `set local role authenticated`; service-role client is a separate, narrowly-used escape hatch |
| **Domain modules** (`/modules/*`) | Business logic for each of the seven product modules. Pure-ish TypeScript: take typed inputs, read/write via repository functions, return typed outputs. Know nothing about HTTP | Plain TS modules; each exports services + repository functions; depends on `/db`, `/ai`, `/integrations` via interfaces |
| **Memory spine** (`/modules/memory`) | The Business Memory + Pipeline Memory records, their confirmation/provenance state, and the **embedding pipeline** that keeps pgvector in sync. Every other module reads it; only Knowledge Layer and the auto-update hooks write the canonical record | Postgres tables (`business_memory`, `pipeline_entry`, `interaction`); `embeddings` table (pgvector); Inngest `embed` function triggered on confirmed writes |
| **RAG / retrieval service** (`/ai/rag`) | Given a query + tenant + scope, do hybrid retrieval (pgvector cosine + Postgres FTS) over {curated corpus, business memory, pipeline memory}, assemble a cited context block, hand to Claude for synthesis, return answer + citations | pgvector `<=>` operator with HNSW index; `tsvector` for keyword; reranking optional later; Voyage/Cohere embeddings |
| **AI orchestration layer** (`/ai`) | Owns *every* Anthropic call. Agent definitions (deck-review, brief-gen, follow-up, app-answers, scoring, q&a, q&a-drill), structured-output Zod schemas, **prompt-cache management** (business memory + corpus = cached prefix), **model routing** (Opus/Sonnet/Haiku), retries, the OpenAI/Codex fallback, and the boundary to the eval harness | Anthropic SDK with `cache_control` on the stable prefix; one function per agent returning a Zod-parsed object; a thin `runAgent(agent, input, {model})` wrapper; `langfuse`/`llm-ops` for tracing |
| **Deterministic math core** (`/modules/raise-ops/cap-table-engine`, `/modules/raise-ops/safe-engine`) | **NO LLM.** Cap-table dilution waterfall, pre/post-money conversion, SAFE-to-equity at qualifying financing, MFN cascade (lowest cap among MFN SAFEs), option-pool refresh. SAFE variable substitution against vetted templates (string substitution into `.docx`, never model-generated language). Both fully unit-tested | Pure functions over plain data structures; `decimal.js` (never floats) for money/shares; `docxtemplater`-style placeholder substitution with a strict whitelist of variables; test suite of 30 scenarios as a frozen oracle |
| **Integration adapters** (`/integrations/*`) | Each external service behind a stable interface. The rest of the app talks to `GmailAdapter`, `DriveAdapter`, `ESignAdapter`, etc. — never to the vendor SDK directly. Founder-approval gate lives *above* the adapter (in the domain module / UI), not inside it | Adapter pattern: an interface + a concrete impl per vendor + a fake for tests; OAuth token storage per tenant (encrypted); MCP connectors used at build time, but production code calls the vendor REST APIs directly so behavior is deterministic and testable |
| **Background jobs** (Inngest) | Anything slow, retryable, fan-out, scheduled, or webhook-driven: deck parse → embed → review, transcription, brief enrichment, e-sign webhook handling, reminder crons. Steps are memoized so retries don't re-do work | Inngest functions triggered by events (`deck.uploaded`, `transcript.received`, `memory.confirmed`, `brief.requested`) or cron; each step idempotent; long ops (LlamaParse, Deepgram, Exa crawl) are individual `step.run` calls |
| **Billing / entitlements** (`/modules/billing`) | Stripe subscription state ↔ tenant tier (Pre-Raise / Active Raise / Close Mode / Alumni); a single `entitlements(tenantId)` function that every router consults to gate module access; Stripe webhook handler; Customer Portal | Stripe + Stripe Tax; `tenant.subscription_tier` column updated by webhook; `assertEntitled(ctx, 'feature')` middleware on protected procedures; Alumni auto-downgrade triggered when Pipeline Memory marks round closed |
| **Data-residency router** | Maps a tenant's declared region (US / UK / IN; EU at V2) to the correct Supabase project. App is region-agnostic; a connection-string lookup per tenant routes reads/writes | At MVP: 1–2 Supabase projects (US-East serving US+UK, an India region for IN); a `tenant.region` column + a `getDbForRegion(region)` factory; promote to a true per-region deployment only when EU residency lands at V2 |

---

## Recommended Project Structure

```
src/
├── app/                          # Next.js App Router
│   ├── (marketing)/              # public marketing site — same repo
│   ├── (app)/                    # authed app shell, ambient Q&A sidebar lives here
│   │   ├── knowledge/ pitch-lab/ pipeline/ live-raise/ data-room/ legal/ raise-ops/
│   ├── api/
│   │   ├── trpc/[trpc]/route.ts  # tRPC handler
│   │   ├── webhooks/stripe/      ┐
│   │   ├── webhooks/dropbox-sign/├─ thin: verify signature → emit Inngest event
│   │   ├── webhooks/supabase-auth/┘
│   │   └── inngest/route.ts      # Inngest serve endpoint
│
├── server/
│   ├── trpc.ts                   # initTRPC, context, protectedProcedure, assertEntitled
│   ├── routers/                  # one router per module → appRouter
│   └── context.ts                # session → tenantId → request-scoped Drizzle client
│
├── db/
│   ├── schema/                   # Drizzle schema, one file per domain area
│   │   ├── tenancy.ts            # users, tenants(=businesses), memberships
│   │   ├── memory.ts             # business_memory, pipeline_entry, interaction
│   │   ├── embeddings.ts         # pgvector table(s) + index defs
│   │   ├── corpus.ts             # curated fundraising corpus (NO tenant_id — global, read-only)
│   │   ├── decks.ts pitch.ts investors.ts dataroom.ts legal.ts capTable.ts safe.ts ff.ts esign.ts
│   ├── rls.ts                    # pgPolicy definitions co-located, drizzle-orm/supabase helpers
│   ├── client.ts                 # request-scoped (RLS) client + service-role client (escape hatch)
│   └── migrations/
│
├── modules/                      # business logic — no HTTP, no React
│   ├── memory/                   # the spine: read/write Business + Pipeline Memory
│   │   ├── business-memory.service.ts
│   │   ├── pipeline-memory.service.ts
│   │   ├── provenance.ts         # source snippets, conflict surfacing
│   │   └── embed.pipeline.ts     # chunk → embed → upsert into pgvector
│   ├── knowledge/                # Knowledge Pack Import parsers + ambient Q&A wiring
│   ├── pitch-lab/                # deck reviewer; voice coach (V2); q&a drill (V2)
│   ├── investor-pipeline/        # match, application tracker, outreach, warm-intro
│   ├── live-raise/               # pre-call brief, transcript ingest, follow-up, pipeline writeback
│   ├── data-room/                # checklist gen, Drive orchestration, access analytics, DDQ filler (V2)
│   ├── legal-stack/              # vendor recommender, compliance checklist (V2)
│   ├── raise-ops/                # V3
│   │   ├── safe-engine/          # ── DETERMINISTIC. variable substitution. heavily unit-tested. NO LLM.
│   │   │   ├── templates/        #    YC + Cooley GO .docx with {{placeholders}}
│   │   │   ├── substitute.ts     #    strict whitelist; throws on unknown var; injection-audited
│   │   │   └── substitute.test.ts
│   │   ├── cap-table-engine/     # ── DETERMINISTIC. dilution/MFN/conversion math. NO LLM.
│   │   │   ├── waterfall.ts mfn.ts conversion.ts optionPool.ts
│   │   │   ├── scenarios/        #    the 30-scenario spreadsheet oracle as fixtures
│   │   │   └── *.test.ts
│   │   ├── ff-manager/           # CRM tracker — never "fund"
│   │   └── esign/                # orchestrates ESignAdapter; audit trail assembly
│   └── billing/                  # Stripe state ↔ tenant tier; entitlements()
│
├── ai/                           # the ONLY place Anthropic is called from production code
│   ├── client.ts                 # Anthropic SDK wrapper; cache_control management; retries
│   ├── router.ts                 # model routing: pick Opus/Sonnet/Haiku per agent + size
│   ├── fallback.ts               # OpenAI/Codex bridge — used only on hard failure
│   ├── schemas/                  # Zod schemas for every structured output (deck issue, scorecard, brief…)
│   ├── prompts/                  # versioned prompt templates; cached-prefix vs variable-suffix split
│   ├── agents/
│   │   ├── deck-review.agent.ts  # Opus + structured output over deck + business memory + defect taxonomy
│   │   ├── brief-gen.agent.ts    # Opus; consumes EnrichmentAdapter output
│   │   ├── follow-up.agent.ts    # Sonnet/Opus over transcript + memory + writing style
│   │   ├── app-answers.agent.ts  # Sonnet over business memory
│   │   ├── scoring.agent.ts      # Opus structure scoring (V2 voice coach)
│   │   ├── qa-rag.agent.ts       # Opus synthesis over RAG context
│   │   ├── qa-drill.agent.ts     # Opus question generation (V2)
│   │   └── classify.agent.ts     # Haiku cheap classification (deck-issue triage, polling)
│   ├── rag/                      # retrieval: hybrid pgvector + FTS; context assembly; citation tracking
│   └── eval/                     # the eval harness — IMPORTS agents, runs fixtures, scores. Separate dir.
│       ├── fixtures/             # anonymized decks, pitches, transcripts with expected outputs
│       ├── runners/              # deck-review-eval.ts, brief-eval.ts, scoring-eval.ts
│       └── metrics.ts            # false-positive rate, latency p50, "no fabricated refs" check
│
├── integrations/                 # adapter pattern — one interface, vendor impls, fakes
│   ├── gmail/  calendar/  drive/  transcript-import/  esign/  enrichment/  deck-parse/  transcribe/
│   │   ├── <name>.adapter.ts     # interface + concrete impl
│   │   └── <name>.fake.ts        # in-memory fake for tests
│   └── oauth/                    # per-tenant OAuth token storage (encrypted), refresh
│
├── inngest/
│   ├── client.ts
│   └── functions/                # deck-pipeline.ts, transcript-pipeline.ts, embed.ts,
│                                 # brief-enrich.ts, esign-webhook.ts, reminders.cron.ts
│
└── lib/                          # crypto (field encryption), money (decimal), errors, env, redis
```

### Structure Rationale

- **`modules/` is the product, `ai/` and `integrations/` and `db/` are infrastructure it leans on.** Domain modules depend *inward* on these, never the reverse. A new feature module slots in without touching the spine.
- **The memory spine is its own module (`modules/memory`) with the embedding pipeline attached.** Everything else imports `business-memory.service` / `pipeline-memory.service`. This is the moat in code form — one place to harden, one place to evolve the schema.
- **`ai/` is a hard wall.** Production code never calls `new Anthropic()` outside `ai/client.ts`. That makes prompt-caching, model-routing, cost tracking, and the no-training-data posture *enforceable* (one chokepoint to audit), and makes the OpenAI fallback a config flip, not a rewrite.
- **`raise-ops/safe-engine` and `raise-ops/cap-table-engine` are physically separated from `ai/`** and have no import path to it. The deterministic-vs-LLM boundary is enforced by directory structure + a lint rule (`no-restricted-imports`: cap-table/safe engines may not import `ai/`). This is the cheapest way to keep a non-negotiable non-negotiable.
- **`ai/eval/` imports the agents but lives apart** so eval fixtures and metrics don't bloat production bundles, and so "the eval harness" is a thing you can point at, run in CI, and gate ships on (PRD requires eval harness "from day 1" for the deck reviewer).
- **`integrations/` adapters all ship with fakes** — the only way to test brief generation, e-sign flows, Drive orchestration, and Gmail send without hitting live services. Founder-approval gates live in the *module*, above the adapter.
- **`db/schema/corpus.ts` has no `tenant_id`** — the curated fundraising corpus is global, read-only, RLS-exempt (or `using (true)` for `select`). Keeping it separate prevents it from accidentally getting tenant-scoped policies and prevents tenant data from leaking into "shared" tables.

---

## Architectural Patterns

### Pattern 1: Tenant-scoped tRPC context backed by Postgres RLS (defense in depth)

**What:** Two layers of tenant isolation. (1) **Postgres RLS** is the backstop: every tenant table has `tenant_id` and a policy `using (tenant_id = current_tenant_id())` where `current_tenant_id()` reads the request's JWT claims; queries run as the `authenticated` role, so even a buggy query physically cannot return another tenant's rows. (2) **tRPC `protectedProcedure`** is the ergonomic layer: it resolves the session, looks up the tenant, and exposes `ctx.tenantId` + a request-scoped Drizzle client; application queries still filter by `ctx.tenantId` for clarity, but RLS is what makes it *safe*.

**When to use:** Every read/write of tenant data. The service-role (RLS-bypassing) client exists only for: webhook handlers that have no user session (Stripe, Dropbox Sign — they look up tenant from the payload), Inngest jobs (which carry an explicit `tenantId` and re-assert it), and admin tooling. Those call sites are a short, audited list.

**Trade-offs:** RLS adds a small per-query cost and some policy-writing overhead, and Drizzle migrations must manage `enable row level security` + `pgPolicy` (Drizzle's `drizzle-orm/supabase` helpers — `authenticatedRole`, `authUid` — and `pgPolicy()` make this first-class). Worth it: a tenant-data leak is existential for a product whose pitch includes "defensibly mine." Don't try to enforce isolation in application code alone — one missing `.where(eq(t.tenantId, ...))` and you've leaked a founder's cap table.

**Example:**
```typescript
// db/schema/memory.ts
export const businessMemory = pgTable('business_memory', {
  id: uuid().primaryKey().defaultRandom(),
  tenantId: uuid().notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  // ...company facts...
}, (t) => [
  pgPolicy('tenant_isolation', {
    for: 'all',
    to: authenticatedRole,
    using: sql`${t.tenantId} = (auth.jwt() ->> 'tenant_id')::uuid`,
    withCheck: sql`${t.tenantId} = (auth.jwt() ->> 'tenant_id')::uuid`,
  }),
]);

// server/context.ts
export async function createTRPCContext({ req }) {
  const session = await getSupabaseSession(req);          // null if unauthed
  const tenantId = session ? await resolveTenant(session.user.id) : null;
  const db = session ? rlsClient(session.accessToken)      // runs as `authenticated`, JWT carries tenant_id
                     : null;
  return { session, tenantId, db };
}

// server/trpc.ts
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session || !ctx.tenantId || !ctx.db) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { ...ctx, session: ctx.session, tenantId: ctx.tenantId, db: ctx.db } });
});
```

### Pattern 2: The memory spine as the system of record; pgvector as a derived index

**What:** Business Memory and Pipeline Memory are **canonical relational records** in Postgres. The vector embeddings are a **derived, regenerable index** — never the source of truth. The flow is always: a write to the canonical record → emit a domain event → an Inngest function chunks, embeds (Voyage/Cohere), and upserts rows into the `embeddings` table (each row: `tenant_id`, `source_type`, `source_id`, `chunk_text`, `embedding vector`, `embedded_at`, `model_version`). Reads for RAG hit `embeddings` (HNSW index, cosine distance) *plus* Postgres FTS on `chunk_text`, fuse the results, and **carry `source_type`/`source_id` through to the answer so every cited fact links back to the row it came from.**

**When to use:** All memory writes go through `modules/memory` services, which (a) update the relational record, (b) record provenance (source snippet, imported_at, conflict flags), (c) emit `memory.confirmed` / `pipeline.updated`. Never embed-on-write synchronously in the request path — it bloats latency and couples user-facing latency to an external embedding API.

**Trade-offs:** Eventual consistency between the record and its embeddings (seconds, via Inngest) — fine for this domain. Re-embedding on `model_version` change is a backfill job, not a migration. Keeping `source_type`/`source_id` denormalized on every chunk costs a little space but is what makes "citation in every answer" cheap. **No premature optimization:** pgvector with HNSW comfortably handles 10M+ vectors and Postgres handles 100K+ users — don't add Pinecone/Weaviate; the Build Stack doc explicitly forbids it.

### Pattern 3: One AI agent = one function with a Zod-typed output and a cached prefix

**What:** Each AI capability (`deck-review`, `brief-gen`, `follow-up`, `app-answers`, `scoring`, `qa-rag`, `qa-drill`, `classify`) is a single function: `(input) => Promise<ZodInferredOutput>`. Internally it (1) builds a prompt as **stable prefix + variable suffix** — the stable prefix (curated corpus excerpts, defect taxonomy, the founder's confirmed Business Memory, system instructions) gets `cache_control: { type: 'ephemeral' }` so it's billed once and reused across calls in the session; the variable suffix is the per-call payload (this deck, this investor, this transcript); (2) calls Anthropic via `ai/client.ts` requesting structured output validated against the agent's Zod schema; (3) on parse failure, one repair retry, then the OpenAI/Codex fallback; (4) emits a trace (`langfuse`) with token counts and cache-hit ratio.

**When to use:** Always — there is no "just call the API inline." Model routing is a parameter resolved by `ai/router.ts`: **Opus 4.7** for deep reasoning (deck review, brief synthesis, structure scoring, ambient Q&A synthesis, Q&A-drill generation); **Sonnet 4.6** for high-volume drafting (application answers, follow-up drafts, outreach drafts); **Haiku 4.5** for cheap classification (deck-issue triage/dedup, status polling, conflict-detection in Knowledge Pack Import). Routing can be overridden per call for evals/A-B.

**Trade-offs:** A little ceremony per agent (schema + prompt split + wrapper) — but it's what makes prompt caching *enforceable* (single chokepoint), makes outputs *type-safe* end-to-end (Zod schema flows into tRPC return types into React), makes the model swap a config change, and makes the eval harness trivial (it just calls the same functions with fixtures). The cached prefix is the single biggest cost lever (30–50% token savings on repeated context per the `claude-api` skill / Build Stack doc) — design the prefix/suffix split deliberately, putting the founder's Business Memory and the corpus in the prefix.

### Pattern 4: The deterministic firewall — LLM-generated *content* never crosses into LLM-generated *computation or legal text*

**What:** A hard, structural boundary. On one side: LLMs draft prose (emails, briefs, application answers, deck rewrite *suggestions*, Q&A) — always founder-reviewed before any external use. On the other side: **two engines that contain zero LLM calls and have no import path to `ai/`** —
- **`cap-table-engine`**: all dilution/conversion math. Pure functions over plain data; `decimal.js` for every monetary/share value (never JS floats — rounding drift is unacceptable in a cap table); MFN cascade picks the lowest cap among MFN-holding SAFEs; option-pool refresh is a discrete entry, not a mutation of prior entries; entries are immutable once a snapshot is exported (corrections = compensating entries). Validated against a frozen **30-scenario spreadsheet oracle** in the test suite — 100% match is the gate.
- **`safe-engine`**: SAFE generation is **string substitution** of a strict whitelist of variables (company name, investor name, amount, valuation cap, discount %, MFN flag, side letters from a fixed list) into vetted YC / Cooley GO `.docx` templates. Unknown variable → throw. Model-generated legal language → impossible (there's no code path to it). The substitution engine gets a Security Engineer audit because a string-injection bug there is catastrophic. An un-bypassable "I will have a lawyer review this OR I waive that protection" gate sits in front of download; every generation is versioned (template version, variables, founder identity, timestamp) for audit.

**When to use:** The instant money, equity, ownership %, or legal-instrument text is involved. The LLM may *populate a form's fields from extracted data* (e.g., "the investor mentioned a $5M cap" → suggest `cap = 5_000_000` for the founder to confirm) but the moment the founder confirms, deterministic code takes over and the LLM is out of the loop.

**Trade-offs:** Less "magic" — the cap table won't infer anything; the SAFE won't adapt language. That's the point: correctness and UPL-safety over flexibility. Enforce the boundary three ways: directory separation, a `no-restricted-imports` lint rule, and the test-suite oracle. This is cheap insurance against the single class of bug that could end the company.

### Pattern 5: Integration adapters with founder-approval gates above the adapter

**What:** Every external system (Gmail, Calendar, Drive, transcript importers, Dropbox Sign, Exa/Firecrawl/Apify/Harmonic, LlamaParse, Deepgram) sits behind an interface in `integrations/`. The rest of the app depends on `GmailAdapter`/`DriveAdapter`/`ESignAdapter`/etc., never on the vendor SDK. **The founder-approval gate is not in the adapter** — `GmailAdapter.send()` just sends; the *domain module* (Live Raise, Investor Pipeline) is responsible for never calling `send()` until the founder has clicked approve in the UI, and the UI surfaces the exact payload. Per-tenant OAuth tokens are stored encrypted; Drive is `drive.file`-scoped only (never `drive`); transcript importers normalize Granola/Otter/paste into one internal transcript shape.

**When to use:** Any outbound call to a third party. New provider (DocuSign as e-sign fallback, Crunchbase as investor-data fallback) = new impl of the existing interface, zero changes elsewhere.

**Trade-offs:** An extra layer of indirection and a fake to maintain per adapter — but it's the only way to (a) unit-test flows that involve external services, (b) swap providers without ripple, (c) keep "founder approves all external sends" as an architectural invariant rather than a hope. MCP connectors are great at build time; production code calls vendor REST APIs directly so behavior is deterministic, observable, and testable.

### Pattern 6: Inngest for everything slow, retryable, or webhook-driven; the request path stays fast

**What:** User-facing tRPC calls do the minimum and return; everything else is an event. `deck.uploaded` → Inngest function: `step.run('parse', LlamaParse)` → `step.run('persist-slides')` → `step.run('embed')` → `step.run('review', deckReviewAgent)` → `step.run('notify')`. Each step is memoized: a retry resumes from the last completed step, so a Deepgram or LlamaParse blip doesn't re-bill or re-do work. Webhooks (Stripe, Dropbox Sign, Supabase Auth) are thin: verify signature, emit an Inngest event, return 200. Crons (pipeline reminders, application follow-up nudges, envelope-expiry warnings) are Inngest scheduled functions.

**When to use:** Deck parse/embed/review, transcription, brief enrichment (Exa/Firecrawl crawl can take many seconds), Knowledge Pack ZIP parsing, e-sign envelope lifecycle, all reminder/cron logic, embedding backfills. Synchronous in the request path: the lightweight AI calls that must feel instant (outreach draft <20s, follow-up <20s, app answers <30s) — these can be a direct `runAgent` call with a loading state, since they're a single LLM round-trip; only fan out to Inngest when there's a multi-step pipeline behind them.

**Trade-offs:** Eventual consistency and a job dashboard to watch. Fine — founders expect "uploading… reviewing…" states. Don't over-orchestrate: a single fast LLM call doesn't need a job.

---

## Data Flow

### Key Data Flow A — Deck upload → parse → review → memory update

```
Founder uploads deck (PDF/PPTX/Slides URL)
  → tRPC pitchLab.uploadDeck: validate, store file in Supabase Storage, insert `deck` row (status=parsing),
    emit Inngest `deck.uploaded` { tenantId, deckId }, return { deckId } immediately
  → Inngest deck-pipeline:
      step parse:    DeckParseAdapter (LlamaParse) → structured slide JSON  → persist `deck.parsed_json`
      step embed:    chunk slide text → EmbeddingAdapter → upsert `embeddings` (source_type='deck')
      step review:   deckReviewAgent(slides, businessMemory, defectTaxonomy)   ← Opus, structured output (Zod)
                       cached prefix = corpus excerpts + defect taxonomy + Business Memory
                       variable suffix = this deck's slides
                     → insert `review` row { issues:[{slide_number, original_text, issue_type, severity,
                                              suggested_rewrite, reasoning}], model_version }
      step eval-tap: (sampled) log to eval harness for false-positive tracking
      step notify:   mark deck status=reviewed; client polls / realtime → review dashboard renders
  → Founder accepts/rejects/edits issues → tRPC pitchLab.actOnIssue → `issue_action` rows → "reviewed deck" version
  → If the founder corrects a *fact* the reviewer flagged (deck-vs-reality mismatch) and confirms the corrected
    value → pipeline back into `modules/memory` as a Business Memory update proposal → re-embed on confirm.
```

### Key Data Flow B — Memory → retrieval → brief / Q&A generation

```
Trigger: founder clicks "Generate brief" on a calendar event or pipeline entry
         (or types a question in the ambient Q&A sidebar)
  → tRPC liveRaise.generateBrief { investorId }  (or knowledge.ask { question })
  → resolve tenant; assemble retrieval query from {investor record, Business Memory, deck, prior interactions}
  → RAG service:
       vector search: embeddings WHERE tenant_id = ? AND source_type IN (...)  ORDER BY embedding <=> queryVec
       keyword search: FTS on chunk_text
       fuse + take top-k; ALSO pull global curated-corpus chunks (no tenant_id)
       → context block with [source_type, source_id] tags preserved per chunk
  → EnrichmentAdapter (for briefs): Harmonic-or-curated fund data + Exa/Firecrawl partner posts/portfolio/podcasts
       (this leg runs via Inngest if it's slow; brief assembly waits on it)
  → briefGenAgent(context block, enrichment, investor)  ← Opus, structured output:
       { partner_overview, fund_overview, recent_investments, portfolio_overlap, possible_objections,
         3_smart_questions, warm_intro_path }   — every cited investment/post carries its source link
  → persist `brief` row; render 40-line dossier; offer PDF export; email to founder (GmailAdapter, no approval
    needed — it's emailing the founder themselves, not an investor)
  → (Q&A path) qaRagAgent synthesizes an answer with inline citations to the chunks; says "I don't know" if
    retrieval is empty/weak; response p50 < 8s.
```

### Key Data Flow C — SAFE generation → e-sign → cap table (the deterministic leg)

```
Founder (Close Mode tier) clicks "Send SAFE" on an F&F or pipeline entry
  → ff-manager pre-fills the SAFE form with that person's name + committed amount
  → founder picks variant (post-money cap / discount / cap+discount / MFN) + side letters (from fixed list)
  → safe-engine.substitute(template, variables):  STRICT WHITELIST. unknown var → throw.   ← NO LLM, ever
       → SAFE PDF + underlying .docx ; insert `generated_safe` { template_version, variables, founder_id, ts }
  → un-bypassable gate: founder checks "I will have a lawyer review this OR I waive that protection"  → enables download/send
  → ESignAdapter (Dropbox Sign): create envelope (investor: signature/date/printed name; founder counter-sign)
       → Inngest tracks; webhook `esign.envelope.signed` → emit Inngest event
  → on signed:
       store signed PDF (with timestamp + IP audit trail) in Supabase Storage
       cap-table-engine: add SAFE entry → recompute waterfall/MFN cascade  ← NO LLM. decimal.js. unit-tested.
       pipeline entry → stage = 'committed' (auto)
       cap table reflects the signed SAFE within 30s
  → founder can export cap table to Excel (matches Carta/lawyer format) or hand off to Carta/Pulley.
```

### State Management (client)

```
Server Components fetch via tRPC server caller (no client JS for initial render)
Client Components: TanStack Query (React Query) caches tRPC reads; mutations invalidate keys
Long-running jobs: optimistic "processing" UI; poll a `getStatus` query or subscribe via Supabase Realtime on the row
Ambient Q&A sidebar: its own query; never blocks page render
```

---

## Scaling Considerations

| Scale | Architecture adjustments |
|-------|--------------------------|
| **0–1k users** (MVP → soft launch) | The monolith as designed. One Supabase project per residency region (US-East serving US+UK, an India region). pgvector with HNSW. Inngest free/cheap tier. Prompt caching on from day one (cost, not throughput). No Redis-as-cache yet beyond rate limiting. Don't optimize anything. |
| **1k–100k users** | Still the monolith. First likely pressure points: (a) embedding-table query latency under big corpora — tune HNSW params, partition `embeddings` by `tenant_id` or `source_type` if needed; (b) Inngest concurrency limits during peak deck uploads — raise concurrency caps, add per-step rate limits to LlamaParse/Deepgram; (c) Supabase connection pool under serverless fan-out — use a pooler (Supavisor) and keep request-scoped clients short-lived; (d) AI cost — caching plus Haiku-for-classification keeps margin >75%; watch the brief-enrichment leg (Exa/Firecrawl) for cost. Add Upstash Redis as a read cache for hot Business Memory / corpus lookups if the prefix-assembly cost shows up in traces. |
| **100k+ users** | Postgres still fine for the relational core; if a single Postgres can't hold all regions' tenants, the residency router already gives you sharding-by-region for free. Consider extracting the AI orchestration layer into its own service *only if* its scaling profile (long-running, bursty, GPU-adjacent cost) genuinely diverges from the web tier — but `ai/` is already a clean module, so this is a deployment change, not a redesign. Consider a dedicated vector store only if pgvector benchmarks actually fail at your corpus size (they won't at 10M vectors). |

### Scaling Priorities

1. **First bottleneck: AI cost, not compute.** The lever is prompt caching (cached prefix = corpus + Business Memory + taxonomy) and model routing (Haiku for classification, Sonnet for drafting, Opus only for deep reasoning). This is a *day-one* design decision, not a later optimization — bake it into `ai/client.ts` and `ai/router.ts` from the start.
2. **Second bottleneck: background-job throughput during traffic spikes** (a cohort of design partners all uploading decks at once). Mitigation: Inngest concurrency + per-step rate limits on the slow external APIs (LlamaParse, Deepgram, Exa); idempotent steps so retries are free.
3. **Third bottleneck: Supabase connections under serverless fan-out.** Mitigation: connection pooler, short-lived request-scoped clients, push slow work to Inngest so request handlers return fast.

Everything else (pgvector capacity, Postgres row counts, Vercel function limits) is far past the horizon — the Build Stack doc's rule stands: refactor when load demands, not before.

---

## Anti-Patterns

### Anti-Pattern 1: Enforcing tenant isolation only in application code

**What people do:** Rely on `.where(eq(table.tenantId, ctx.tenantId))` everywhere and skip RLS because "it's faster" or "RLS is fiddly."
**Why it's wrong:** One forgotten `where` clause, one raw query, one new endpoint by a tired solo builder at 1am — and a founder's cap table or investor pipeline leaks to another tenant. For a product whose pitch literally includes "defensibly mine, not training someone else's model," that's existential. Also kills SOC 2.
**Do this instead:** RLS on every tenant table as the backstop (`pgPolicy` co-located in the Drizzle schema), application-level `tenantId` filtering for clarity *on top*, and a tiny audited list of service-role call sites (webhooks, Inngest jobs, admin). Defense in depth.

### Anti-Pattern 2: Letting an LLM touch the cap table or write SAFE legal language

**What people do:** "Just ask Claude to compute the dilution" or "have the model fill in the SAFE clauses" — it's easier than writing the math/templates.
**Why it's wrong:** LLMs make arithmetic mistakes and hallucinate; a wrong cap table or a model-improvised SAFE clause is a financial/legal disaster and direct UPL exposure. PROJECT.md and PRD §12 forbid it outright — this is not a design choice.
**Do this instead:** `cap-table-engine` and `safe-engine` are pure deterministic code, `decimal.js` for money, unit-tested against a frozen oracle, with no import path to `ai/` (enforced by lint). The LLM may *suggest field values* for the founder to confirm; deterministic code does everything after confirmation.

### Anti-Pattern 3: Calling the Anthropic SDK directly from feature modules

**What people do:** `import Anthropic from '@anthropic-ai/sdk'` in `modules/pitch-lab/...` and `modules/live-raise/...` and ten other places, each with its own prompt and no caching.
**Why it's wrong:** Prompt caching becomes un-enforceable (the single biggest cost lever — 30–50% — evaporates); model routing is inconsistent; the no-training-data posture can't be audited; the OpenAI fallback becomes a rewrite; structured-output schemas drift.
**Do this instead:** All Anthropic calls go through `ai/client.ts` via per-agent functions in `ai/agents/`. One chokepoint for caching, routing, retries, fallback, tracing, and the privacy posture.

### Anti-Pattern 4: Embedding-on-write in the request path

**What people do:** When the founder confirms Business Memory, synchronously chunk + call the embedding API + upsert vectors before returning.
**Why it's wrong:** Couples user-facing latency to an external embedding API's latency and outages; a slow embedding call blocks the confirmation UI; re-embedding on a model upgrade becomes a scary inline operation.
**Do this instead:** Confirm → write the canonical relational record → emit `memory.confirmed` → an Inngest function does the embedding. The relational record is the source of truth; vectors are a regenerable derived index. (Same for deck text, transcripts, corpus.)

### Anti-Pattern 5: Burying the founder-approval gate inside the integration adapter

**What people do:** Put "is this approved?" checks inside `GmailAdapter.send()` or `ESignAdapter.create()`.
**Why it's wrong:** The adapter shouldn't know about product policy; the gate gets duplicated/inconsistent across adapters; it's hard to surface the exact payload to the founder for review at the right moment.
**Do this instead:** Adapters are dumb pipes. The domain module owns the gate: it shows the founder the exact email/intro/envelope, waits for explicit approval, *then* calls the adapter. "Founder approves all external sends" is an architectural invariant at the module layer.

### Anti-Pattern 6: Over-architecting region-residency before there are EU customers

**What people do:** Build a fully region-sharded, multi-deployment, dynamic-routing infrastructure on day one because "data residency."
**Why it's wrong:** Massive complexity for a problem you don't have yet — at MVP it's US + UK + India (UK can sit on US-East contractually), and EU residency is a V2 line item.
**Do this instead:** A `tenant.region` column + a `getDbForRegion(region)` connection factory + 1–2 Supabase projects at MVP. The *app* is region-agnostic from day one (it never assumes a single DB), so adding the EU region at V2 is provisioning + a config entry, not a refactor. Build the seam, not the full machine.

---

## Integration Points

### External Services

| Service | Integration pattern | Notes / gotchas |
|---------|---------------------|------------------|
| **Anthropic API** (Opus 4.7 / Sonnet 4.6 / Haiku 4.5) | All calls via `ai/client.ts`; structured output → Zod; `cache_control` on the stable prefix; model chosen by `ai/router.ts` | Prompt caching mandatory from day 1 (`claude-api` skill); contractually no training on customer data; never log raw financial figures in traces |
| **OpenAI / Codex** | `ai/fallback.ts` — invoked only on hard failure (parse failure after repair, Anthropic outage) | Keep behind the same agent interface so it's a config flip; not a primary path |
| **Voyage AI / Cohere Embed** | `EmbeddingAdapter`; called only from the Inngest embedding pipeline, never the request path | Store `model_version` per chunk so re-embedding is a controlled backfill |
| **Supabase** (Postgres + pgvector + Storage + Auth) | One project per residency region; RLS on all tenant tables; request-scoped client runs as `authenticated`; service-role client narrowly used | Use a connection pooler under serverless; signed URLs for Storage; cap-table/audio buckets get field-level encryption on the sensitive columns *in addition to* at-rest encryption |
| **Inngest** | Event-driven functions for all slow/retryable/webhook/cron work; memoized steps | Idempotent steps; per-step rate limits on slow external APIs; carry `tenantId` explicitly into every job and re-assert it |
| **Stripe + Stripe Tax** | `modules/billing`; webhook → update `tenant.subscription_tier`; Customer Portal for self-serve; `entitlements(tenantId)` gates module access | Webhook handler uses service-role client (no user session); resolve tenant from the Stripe customer ID; Alumni auto-downgrade fired by Pipeline Memory "round closed" event |
| **LlamaParse** | `DeckParseAdapter`; called from the deck Inngest pipeline | Free tier → paid; rate-limit the step; image-only slides → flag "not analyzed" |
| **Deepgram Nova-3** (V2) | `TranscribeAdapter`; called from voice-coach and transcript Inngest pipelines | Audio stored tenant-isolated + encrypted; never sent to training |
| **Hume AI** (V2) | Behind a `ProsodyAdapter`; voice-coach pipeline only | Filler-word detection is a *custom* detector, separate from Hume; never penalize accent |
| **Exa / Firecrawl / Apify** | `EnrichmentAdapter`; brief-gen and outreach-drafter enrichment; runs via Inngest when slow | Stay within ToS — no bulk LinkedIn scrape; founders supply LinkedIn exports/cookies for warm-intro |
| **Harmonic / Crunchbase** (V2) | `InvestorDataAdapter`; at MVP the impl is the curated top-200 list + 30+ accelerators (same interface) | Swapping curated→Harmonic is a new impl, no ripple; identity resolution across sources is its own concern |
| **Gmail / Google Calendar / Google Drive** | `GmailAdapter` / `CalendarAdapter` / `DriveAdapter`; per-tenant OAuth tokens encrypted; Drive scoped to `drive.file` only | Founder-approval gate lives above the adapter; Drive: "Restricted" default permissions, Trochia stores only metadata (file IDs, names, access events), revoking access invalidates all share links |
| **Granola / Otter** (transcript import; V2 API, paste/file at MVP) | `TranscriptImportAdapter` normalizes all sources into one internal transcript shape | Low-quality transcripts flagged for founder verification |
| **Dropbox Sign / DocuSign** (V3) | `ESignAdapter` (Dropbox Sign primary, DocuSign as a second impl of the same interface) | ESIGN/eIDAS-compliant flow only; Aadhaar e-sign optional for India; audit trail (timestamps, IPs) embedded in the final signed PDF; webhook → Inngest → cap-table update |
| **Resend** | Transactional email (auth, billing, system notices) — distinct from the Gmail *send-as-founder* path | Don't conflate: Resend = Trochia→founder system mail; Gmail adapter = founder→investor mail, always approved |
| **Sentry / Amplitude / Langfuse** | Sentry for errors, Amplitude for product analytics, Langfuse (or `llm-ops`) for AI traces | AI traces must scrub financial figures and PII |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Feature module ↔ memory spine | Direct function call to `modules/memory` services | Every module reads it; only Knowledge Layer + auto-update hooks write the canonical record. This is *the* internal boundary that must stay clean — it's the moat. |
| Feature module ↔ `ai/` | Direct call to a per-agent function (`deckReviewAgent(...)`) | Modules never construct prompts or touch the Anthropic SDK. |
| `cap-table-engine` / `safe-engine` ↔ `ai/` | **None — forbidden.** Enforced by `no-restricted-imports` lint rule + directory separation | The deterministic firewall. The engines may receive *suggested* values that originated from an LLM upstream, but they have no code path to call one. |
| Feature module ↔ `integrations/` | Direct call to an adapter interface; never to a vendor SDK | Founder-approval gate is in the module, above the adapter. |
| Anything slow/retryable ↔ rest of app | Inngest events (`deck.uploaded`, `memory.confirmed`, `transcript.received`, `brief.requested`, `esign.envelope.*`) | Decouples user-facing latency from external-service latency; steps memoized for free retries. |
| tRPC routers ↔ DB | Always via the request-scoped (RLS) Drizzle client from context | Service-role client is a short, audited list of exceptions (webhooks, jobs, admin). |
| `ai/eval/` ↔ `ai/agents/` | Eval imports the agent functions and runs them against fixtures | Eval lives in a separate directory, runs in CI, gates ships (deck-reviewer false-positive rate <25%, no fabricated refs, latency p50). |

---

## Build Order Implications (dependency rationale)

This aligns with — and slightly sharpens — the Build Stack doc's 11-phase GSD sequence and PRD §13. The principle: **build the spine and the trust boundaries first; feature modules sit on top.**

**Foundational (must come first — everything depends on them):**

0. **Foundation / platform** — Next.js 15 monolith on Vercel; Supabase (Postgres + pgvector + Storage); Drizzle with the **tenancy schema + RLS policies in place from day one** (don't retrofit RLS — it's brutal to add later); Supabase Auth (Google SSO); the **tRPC context builder with tenant scoping**; Stripe billing skeleton + the `entitlements()` function (even if only two tiers exist yet); the `tenant.region` column + `getDbForRegion()` factory (the residency *seam*, not the full machine); Resend/Sentry/Amplitude; Inngest wired up; `ai/client.ts` skeleton with prompt-caching plumbing. *Rationale: RLS, tenant scoping, billing/entitlements, and the AI chokepoint are load-bearing for every later module; the AI orchestration layer and integration-adapter pattern are conventions you want established before the first feature uses them.*

1. **Knowledge Layer + Memory spine** — Business Memory + Pipeline Memory schema + provenance; Knowledge Pack Import parsers (paste → file upload); the **embedding pipeline** (Inngest: chunk → embed → upsert pgvector); the curated corpus loaded; the **RAG service** (hybrid retrieval + citation tracking); ambient Q&A sidebar (the first real `ai/agents` consumer — `qa-rag.agent`). *Rationale: this is the moat and literally every other module reads from it. Build it second, right after the platform, so every subsequent feature has memory to ground on. The RAG/citation machinery built here is reused by briefs, DDQ filler, application answers, and Q&A drill.*

**Feature modules (sit on top of the spine — order by user-journey dependency):**

2. **Pitch Lab — Deck Reviewer** — deck upload → LlamaParse (`DeckParseAdapter`) → parse → embed → `deck-review.agent` (Opus, structured output over deck + Business Memory + defect taxonomy) → review dashboard; **the eval harness ships here, from day one** (`ai/eval/` with anonymized-deck fixtures, false-positive tracking). *Rationale: needs the memory spine (deck-vs-reality checks) and the AI layer; establishes the structured-output + eval-harness patterns the rest of the AI features inherit; it's also the first "wow" and the first content surface (deck teardowns).*

3. **Investor Pipeline** — `InvestorDataAdapter` (curated list impl at MVP); match algorithm (Business Memory + partner-thesis embedding similarity — reuses pgvector); application tracker + `app-answers.agent` (Sonnet, from Business Memory); outreach drafter + `EnrichmentAdapter` (Exa/Firecrawl); warm-intro mapper (LinkedIn export); `CalendarAdapter` for reminders. *Rationale: depends on memory (matching, application answers) and on the enrichment + calendar adapters; produces the Pipeline Memory entries that Live Raise consumes.*

4. **Live Raise** — pre-call brief (`brief-gen.agent`, Opus, over Business Memory + deck + prior interactions + enrichment) → transcript ingestion (`TranscriptImportAdapter`, paste/file) → `follow-up.agent` (over transcript + memory + writing style) → Pipeline Memory writeback (kanban, auto-update on follow-up sent / transcript ingested); `GmailAdapter` send (founder-approved). **← MVP soft launch exit gate.** *Rationale: depends on memory + pipeline + the enrichment/calendar/gmail adapters; closes the end-to-end raise loop; everything downstream of pipeline (transcripts, follow-ups) writes back into the spine.*

5. **Voice Pitch Coach + Q&A Drill (V2)** — WebRTC capture; `TranscribeAdapter` (Deepgram); `ProsodyAdapter` (Hume) + custom filler detector; `scoring.agent` (Opus, structured rubric); `qa-drill.agent` (Opus, from deck + memory + hardest-questions corpus). *Rationale: a new media pipeline (audio) but it slots into the existing AI/eval/storage patterns; tenant-isolated encrypted audio bucket.*

6. **Data Room (V2)** — vertical-aware checklist generator (from Business Memory); `DriveAdapter` (`drive.file`-scoped) folder orchestration; access analytics (metadata only); DDQ filler (reuses the RAG/citation machinery from the Knowledge Layer). *Rationale: depends on memory + Drive adapter; DDQ filler is the Knowledge Layer's retrieval pattern applied to a new surface.*

7. **Legal Stack (V2)** — vendor recommender (decision tree by business type × stage × geography × team size) + compliance checklist + affiliate tracking; **EU data residency lands here** (promote the residency seam to a real EU Supabase region); MFA added to auth. *Rationale: mostly a data/decision-tree module (low AI surface); pairs naturally with the EU push because EU founders are the trigger for both EU residency and the legal-vendor expansion.*

8. **Raise Ops core — SAFE + Cap Table (V3)** — the **deterministic engines**: `cap-table-engine` (dilution/MFN/conversion math, `decimal.js`, unit-tested against the 30-scenario oracle) + `safe-engine` (whitelisted variable substitution into vetted templates, Security Engineer audit, un-bypassable lawyer-review gate); cap-table UI + Excel export + Carta/Pulley hand-off. *Rationale: deliberately late — it's the highest-stakes, most-regulated module and benefits from a mature platform underneath; it has the **least** dependency on the AI layer (by design — the firewall) and the **most** on disciplined testing. Law-firm template partner must be locked before this phase starts.*

9. **F&F Round Manager + E-Sign (V3)** — F&F tracker (CRM, never "fund") with auto-progression; `ESignAdapter` (Dropbox Sign); signed-SAFE storage + audit trail; cap-table auto-update on signature; pipeline auto-advance to "committed". *Rationale: sits directly on top of the SAFE/cap-table engines and the integration-adapter pattern; the e-sign webhook → Inngest → cap-table-update flow ties the V3 modules together.*

10. **Polish + Close Mode launch + Alumni tier (V3)** — Close Mode + Alumni billing tiers live (entitlements already built); Investor Update Generator (Alumni — reuses memory + the drafting-agent pattern); auto-downgrade prompt (Pipeline Memory "round closed" event → billing); SOC 2 Type I prep with Vanta; public launch. *Rationale: pure assembly on top of everything built; the entitlements function from Phase 0 just gets two more tiers wired in.*

**Where to invest up front vs. keep simple:**
- **Invest up front:** RLS + tenant-scoping (retrofitting is brutal, leaks are existential); the memory spine + embedding pipeline + RAG/citation machinery (it's the moat *and* reused everywhere); the `ai/` chokepoint with prompt caching + model routing (biggest cost lever, must be a chokepoint); the deterministic-firewall structure (cheap insurance against a company-ending bug class); the integration-adapter pattern (founder-approval invariant + provider-swappability).
- **Keep simple (build the seam, not the machine):** multi-region residency (a column + a factory + 1–2 projects at MVP — the EU region is V2 provisioning, not a refactor); the investor-data layer (curated list behind the adapter at MVP — Harmonic is a swap, not a rewrite); background jobs (a single fast LLM call doesn't need Inngest — only fan out for multi-step pipelines); the eval harness (start with a handful of fixtures and the must-not-fail checks — false-positive rate, no fabricated refs, latency p50 — grow it as the deck reviewer matures). Per the Build Stack doc: pgvector handles 10M+ vectors, Postgres handles 100K+ users — **refactor when load demands, not before.**

---

## Sources

- `.planning/PROJECT.md` — full Active requirements, per-feature data models, constraints, key decisions (primary source; HIGH confidence — this is the project's own spec)
- `.planning/intel/Trochia_AI_PRD_v2.docx` (extracted) — per-feature functional requirements, acceptance criteria, data models, the 36-week build sequence §13, compliance guardrails §5.5, Raise Ops UPL posture §12 (HIGH confidence — project's own PRD)
- `.planning/intel/Trochia_AI_Build_Stack_v2.md` — confirmed tech stack, the GSD 11-phase build sequence, "buy infra build moat", "no premature optimization — pgvector 10M+, Postgres 100K+" rule, prompt-caching mandate (HIGH confidence — project's own stack doc)
- `.planning/intel/Trochia_AI_Strategy_v1.md` — "memory is the moat", module map, decision rules, compliance posture (HIGH confidence — project's canonical strategy doc)
- Drizzle ORM docs via Context7 (`/drizzle-team/drizzle-orm-docs`, `src/content/docs/rls.mdx`) — `pgPolicy`, `drizzle-orm/supabase` helpers (`authenticatedRole`, `authUsers`, `authUid`), co-locating RLS policies in the schema, `enable row level security` in migrations (HIGH confidence — current official docs, verified 2026-05-11)
- General platform patterns (Next.js 15 App Router + tRPC + Drizzle + Supabase RLS + Inngest as a multi-tenant SaaS stack; adapter pattern for integrations; canonical-record-plus-derived-vector-index for RAG; structured-output-with-Zod for LLM agents; prompt-prefix-caching) — established 2025-2026 community/official practice; consistent with the Build Stack doc's named skills (`saas-multi-tenant`, `trpc-fullstack`, `rag-implementation`, `claude-api`, `llm-structured-output`, `inngest`) (MEDIUM-HIGH confidence — well-trodden, but the *specific* assembly here is a recommendation, not yet validated against a running Trochia system)

---
*Architecture research for: agentic founder-fundraising operating system (Trochia AI)*
*Researched: 2026-05-11*
