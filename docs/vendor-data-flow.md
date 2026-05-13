# Vendor data-flow inventory

**Purpose.** This is the evidence base for **XC-01** — *no customer data is used for model training*. It records every vendor that touches Trochia data (or the repo), what data reaches it, whether it trains on inputs, how long it retains data, and the contract / DPA status.

**Maintenance rule.** This is a living artifact. **Any new vendor that touches customer data MUST be added to this table before it is wired in.** Update the relevant row whenever a vendor's terms, retention, or training posture changes. This document is referenced from the Data Processing Addendum (`/legal/dpa`, `public/legal/dpa.pdf`) as the sub-processor inventory.

**`[VERIFY]` markers** flag a value that has not yet been confirmed against the vendor's current published terms — a standing follow-up before the relevant phase ships.

---

## Data-touching vendors

| Vendor | What data touches it | Trains on inputs? | Retention | DPA / contract status | Notes |
|---|---|---|---|---|---|
| **Anthropic API** | Prompts + responses. Phase 1: only a ~10-token health-check ping. Phase 2+: deck text, Business Memory, Pipeline Memory, transcripts, drafts. | **No** — the API tier is no-training. | ~7 days, then deleted (abuse-monitoring window only). | Commercial terms + DPA available; on file before Phase 2 customer data flows. | All Anthropic calls go through `src/ai/client.ts` (`runAgent<T>()`) — the SDK is imported nowhere else (ESLint-enforced). Prompt caching mandatory on the stable prefix. |
| **OpenAI API (fallback only)** | Same prompt/response classes as Anthropic — **only when `AI_FALLBACK_ENABLED` is on (off by default in production)**. | **No** — the API tier is no-training (zero-data-retention posture requested). `[VERIFY]` ZDR enrollment + current retention. | `[VERIFY]` (ZDR target: 0 days; default API: ~30 days abuse-monitoring). | DPA available. | `src/ai/fallback.ts` is the only file importing `openai` and has **no database credentials**. Never the default production path; config-flagged. |
| **Claude Code / Cursor (build tooling)** | Repo source code only — **never customer data**. | N/A — no customer data flows here. | N/A. | N/A — developer tooling, not a data processor. | `tasks/lessons.md` rule: never paste real customer data into build tooling. Synthetic fixtures only. This row exists so the boundary is explicit. |
| **Supabase** | All stored customer data — `accounts`, `users`, `sessions`, `subscriptions`, `legal_acceptances`, `jobs`; Phase 2+: businesses, decks, investors, pipeline rows, embeddings; Storage: data exports. | **No.** | Until deleted. Accounts: 30-day soft delete (`accounts.deleted_at`) then permanent purge by the `purge-soft-deleted` cron. | DPA available; SOC 2 Type II. EU region added in Phase 8 (residency seam already in code). | Postgres + pgvector. RLS default-deny on every tenant table; encryption at rest. The system of record. The export-JSON bucket path is tenant-isolated (`exports/{accountId}/...`). |
| **Stripe** | Billing data — customer id, subscription id/status, the card-on-file token. **Trochia never sees the PAN** (Stripe Elements / Checkout collects it client-side). | **No.** | Per Stripe's published retention. | DPA available; PCI DSS Level 1. | `entitlements()` reads the persisted subscription status; never calls Stripe inline on the request path. Webhook-driven state mirror + a reconcile cron as the safety net. |
| **Resend** | Transactional email — recipient address + message body. **System mail to the founder only** (verification, data-export-ready, billing notices). | **No.** | Per Resend's published retention. `[VERIFY]`. | DPA available. | Trochia→founder system mail only. Founder→investor emails go via the founder's own Gmail (Phase 3+), never through Resend. No autonomous external sends. |
| **Sentry** | Error contexts — stack traces + request metadata, with PII / financial fields scrubbed by a `beforeSend` hook that reuses the redacting logger's `SENSITIVE_FIELDS` set. | **No.** | Per Sentry's plan retention. | DPA available; Team plan. | IDs and event types only — no deck text, no transcript bodies, no cap-table figures. |
| **Amplitude** | Product analytics events — ids + enum values only. **Never** deck text, financials, or transcript bodies. | **No.** | Per Amplitude's published retention. | DPA available. | The onboarding/activation funnel. Revenue events emitted server-side. |
| **Langfuse** | LLM traces — prompts/responses + token counts + cache-hit metrics. | **No.** | Per Langfuse Cloud's retention (or N/A if self-hosted). `[VERIFY]` — confirm Cloud retention + region at Plan 05 wiring. | DPA available (Cloud) / N/A (self-hosted). | Cache-hit-rate instrumentation. In Phase 1 only the trivial health-check prompt is traced. |
| **Inngest** | Background-job event payloads — ids + the minimum needed to do the work. Never financials or transcript bodies in `jobs.payload`. | **No.** | Per Inngest's published retention. | DPA available. | The slow-work lane. Signing-key-verified invocations; one `serve()` endpoint at `/api/inngest`. |
| **Vercel** | Request logs, build artifacts, deployed application code. **No customer data in application code.** | **No.** | Per Vercel's log/build retention. | DPA available; Pro plan. | Hosting + edge/serverless runtime. |
| **Upstash Redis** *(if used)* | Stripe-webhook dedupe ids; rate-limit counters. **No customer content.** | **No.** | Short TTL (seconds–minutes for rate limits; bounded for dedupe keys). | DPA available. | Idempotency + rate-limiting only. |

---

## `[VERIFY]` follow-ups

| Item | Owner phase | Note |
|---|---|---|
| OpenAI ZDR enrollment + current API retention | Whenever `AI_FALLBACK_ENABLED` is first turned on | Confirm zero-data-retention is in effect before the fallback is enabled in production. |
| Resend retention window | Plan 05 (email wiring) | Confirm against Resend's current DPA / docs. |
| Langfuse Cloud retention + data region | Plan 05 (Langfuse wiring) | Or document self-hosting if chosen instead. |

---

## XC-01 traceability

This inventory + the Data Processing Addendum (`/legal/dpa`, `public/legal/dpa.pdf`) + the Terms of Service (`/legal/terms`) + the product copy on the relevant screens together **state and back** the commitment that **no customer data is used for model training**. The chain is:

1. **Product copy** states the commitment to the founder.
2. **The DPA** makes it a contractual term and names this document as the sub-processor inventory.
3. **The ToS** restates it.
4. **This inventory** records the per-vendor facts — every data-touching vendor, its training posture, its retention, its contract status — and is kept current.

**Any new vendor MUST be added here before it touches customer data.**
