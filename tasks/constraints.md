# Trochia AI — Non-Negotiable Build Constraints

## URL handling
- Current site URL: https://trochia.asranest.com
- Will migrate mid-build to https://trochia.ai
- NEVER hardcode either URL. ALL references read from process.env.NEXT_PUBLIC_SITE_URL or process.env.NEXT_PUBLIC_APP_URL.
- Applies to: auth redirects, Stripe URLs, email templates, OG metadata, sitemap, robots.txt, canonical tags, share links, marketing prose.
- Code Reviewer MUST reject PRs that hardcode URLs.

## Compliance language (banned-string CI from Phase 0 per FND/XC reqs)
- NEVER use "rolling fund" anywhere in code, copy, UI, marketing, or comments.
- NEVER use "investment advice" or "legal advice" without "not"/"this is not" prefixed.
- F&F module must always carry not-an-adviser copy.
- Legal Stack must always carry its disclaimer on every screen.
- SAFE generation has an un-bypassable lawyer-review gate.

## Architecture guardrails
- AI calls only via ai/client.ts chokepoint (no scattered Anthropic API calls).
- Prompt caching MANDATORY on every production Anthropic call (instrumented in Langfuse, not assumed).
- safe-engine and cap-table-engine have NO import path to ai/ (lint-enforced).
- Cap-table math goes through unit tests, NOT an LLM.
- 30-scenario cap-table oracle TDD-first, 100% match required.
- SAFE substitution engine receives a Security Engineer audit before Phase 9 ship.

## Sends and consent
- No autonomous external sends. Every outgoing email/message requires explicit founder approval.
- LinkedIn integration must not violate ToS (no bulk scrape).
- Drive integration uses drive.file scope ONLY.
- Gmail integration is opt-in per-thread, no full mailbox access.

## Data & training
- Customer data NEVER enters a training pipeline.
- No customer data in the OpenAI fallback or any build tooling that could log it.

## UI / design system
- All UI work MUST read docs/BRAND.md and docs/DESIGN-REFERENCE.md before planning or implementing.
- The aesthetic targets harmonic.ai + firecrawl.dev — operator-grade, near-monochromatic, single Signal accent.
- Anti-patterns listed in DESIGN-REFERENCE.md are banned (no gradients on sections, no shadows on cards, no carousels, no AI-buddy copy, etc.).
- Phase 1 must ship a /styleguide internal route exposing every themed component.

## Trochia AI cannot be a substitute for legal counsel
- Every legal-adjacent surface (SAFE generation, F&F, Legal Stack, cap table) carries explicit disclaimers.
- Compliance Auditor pass is non-skippable at Phase 8, 9, and 10.

All subagents (Backend Architect, Frontend Developer, AI Engineer, Code Reviewer, Compliance Auditor, Security Engineer) MUST read this file before planning or executing any phase. Reference it from CLAUDE.md.
