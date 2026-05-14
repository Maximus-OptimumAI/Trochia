# Lessons — Trochia AI

Running log of patterns and rules learned during the build. Reviewed at session start.
New lessons appended after any correction or postmortem.

---

## Security / data handling

- **Never paste real customer data into Claude Code / Cursor / ChatGPT to debug — synthetic fixtures only.** Customer data never enters an AI build-tooling context, ever. Reproduce bugs with synthetic fixtures. (XC-01; seeded Phase 1.)

---

## Stack / scaffolding

- **Phase 1 was built and GSD-verified entirely in `next dev` (NODE_ENV=development). Every feature touching env validation, security headers, CSP, or CI-only tools (Lighthouse, Playwright webServer) needs a separate prod-mode smoke pass before merging.** The first GHA run on PR-1 surfaced three latent prod-only bugs in succession that dev mode masked: (1) vitest cross-file `TRUNCATE` race against shared TEST_DATABASE_URL (file-parallelism on); (2) `src/lib/env.ts` ZodError on every client hydration (strict-prod `prodRequired()` enforces server-only vars against a stripped client bundle); (3) `.lighthouserc.json` missing `startServerCommand` (CI's Playwright tears down its webServer before lhci runs). All three would have been caught by a 30-second `npm run build && npm run start && curl -I / && npx playwright test && npx lhci autorun` pass against the production build. Add this as a required gate to the Phase verification protocol — verifier asks "did you run the prod smoke?" and refuses ACCEPTED-WITH-FOLLOWUPS until the answer is yes. (PR-1, commits f243f61 / 41d372b / this commit.)
