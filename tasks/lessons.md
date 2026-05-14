# Lessons — Trochia AI

Running log of patterns and rules learned during the build. Reviewed at session start.
New lessons appended after any correction or postmortem.

---

## Security / data handling

- **Never paste real customer data into Claude Code / Cursor / ChatGPT to debug — synthetic fixtures only.** Customer data never enters an AI build-tooling context, ever. Reproduce bugs with synthetic fixtures. (XC-01; seeded Phase 1.)

---

## Stack / scaffolding

- **Phase 1 was built and GSD-verified entirely in `next dev` (NODE_ENV=development). Every feature touching env validation, security headers, CSP, or CI-only tools (Lighthouse, Playwright webServer) needs a separate prod-mode smoke pass before merging.** The first GHA run on PR-1 surfaced three latent prod-only bugs in succession that dev mode masked: (1) vitest cross-file `TRUNCATE` race against shared TEST_DATABASE_URL (file-parallelism on); (2) `src/lib/env.ts` ZodError on every client hydration (strict-prod `prodRequired()` enforces server-only vars against a stripped client bundle); (3) `.lighthouserc.json` missing `startServerCommand` (CI's Playwright tears down its webServer before lhci runs). All three would have been caught by a 30-second `npm run build && npm run start && curl -I / && npx playwright test && npx lhci autorun` pass against the production build. Add this as a required gate to the Phase verification protocol — verifier asks "did you run the prod smoke?" and refuses ACCEPTED-WITH-FOLLOWUPS until the answer is yes. (PR-1, commits f243f61 / 41d372b / this commit.)

---

## Operator working with Claude Code

- **Probe before theorizing. The operator should ask Claude to run a probe (curl, pageerror capture, file existence, header dump) BEFORE stating a theory in the prompt — not after.** On three consecutive PR-1 CI failures the operator's theory was specific, plausible, and grounded in a real log line — and wrong every time: (a) "FK violations are missing seed steps" — actual cause was vitest's cross-file `TRUNCATE` race; (b) "marketing page hydration crash is Sentry init on bogus DSN" — actual cause was `src/lib/env.ts`'s single `parse(process.env)` against the strict-prod schema crashing the client; (c) "Lighthouse interstitial is HSTS/upgrade-insecure-requests forcing https on localhost" — actual cause was `.lighthouserc.json` missing `startServerCommand`, leaving lhci to navigate against a dead port. In each case a single 30-second probe (`SELECT FROM information_schema`, `page.on('pageerror')`, `curl -sI`) would have surfaced the actual cause faster than the theorized fix could have been written. The shape that fails: operator skim-reads a CI log, latches onto the first symptom that matches a familiar shape, and writes the prompt as if the diagnosis is already settled. The shape that works: operator pastes the failing log + asks "run a probe to confirm what the server/page/binary is actually doing before proposing a fix." Claude is happy to commit to a theory the operator hands him; he should not be the one breaking that frame on every cycle. (PR-1; the three commits above + this one.)

- **For "page renders blank in CI but works locally," capture `pageerror` (uncaught exceptions reaching `window`) BEFORE reading `console.error`. One real `pageerror` is worth 100 `console.error` lines.** The chromium-launcher probe pattern — launch headless, attach `page.on('pageerror', e => …)`, `page.goto(url)`, dump `pageerror[0]` — takes ~30 seconds and is the highest-leverage diagnostic for hydration-class CI failures. In PR-1 round 3 the operator's strongest theory was "Sentry client init crashing on bogus DSN," grounded in CI logs noisy with Sentry-related `console.error` lines. The actual cause was a `ZodError` thrown by `src/lib/env.ts` doing a single strict-prod `parse(process.env)` on the client bundle: Next correctly strips non-`NEXT_PUBLIC_*` vars from the client, so the full server-schema parse fails on every hydration, replacing the page with Next's error boundary. The probe surfaced it instantly — `pageerror[0]` was a `ZodError`, not anything Sentry-shaped. `console.error` in a prod-mode CI run is full of expected noise (bogus DSN init warnings, hydration mismatches, third-party SDK chatter); `pageerror` is the signal cut. Pattern: when a page mounts blank, the first move is the headless-chromium pageerror probe — not log-scrolling. (PR-1 round 3, commit 41d372b.)
