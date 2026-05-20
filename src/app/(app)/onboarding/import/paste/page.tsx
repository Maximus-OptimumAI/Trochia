import type { Metadata } from 'next';

import { PasteFlow } from './paste-flow';

/**
 * Paste flow — `/onboarding/import/paste` (Plan 02-02 / KNW-02b Task 8).
 *
 * Server-component shell for the Phase-2 paste-extract flow. The `(app)` route
 * group is session-gated by `src/proxy.ts` — `/onboarding/*` requires a session
 * but does NOT require an active subscription (founders pick a tier inside
 * onboarding). The proxy refreshes Supabase cookies on every request, so the
 * authenticated context is already plumbed into the tRPC handler when the
 * client component fires its mutations.
 *
 * This page does NOT pre-fetch the current draft. The Phase-1 onboarding-step
 * pattern (welcome / import / deck / review) renders the client component
 * directly; reload-persistence + the side-by-side conflict view for already-
 * confirmed memory are Week-3 concerns (Plan 02-03 / KNW-02c). For Week-2 the
 * happy path is paste → draft → confirm → continue to `/onboarding/deck`.
 *
 * Voice (BRAND.md): Trochia drafts / cites / tracks. No "we", "feel", "love",
 * "want", "help", "hope" — operator register only. No emoji. No raw hex; all
 * colors come from the brand-token set (ink / paper / graphite / stone / signal
 * / success / warning / danger).
 */
export const metadata: Metadata = {
  title: 'Import context · Trochia',
};

export default function PastePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 bg-paper px-6 py-12 md:py-16">
      <header className="flex flex-col gap-3">
        <h1 className="text-h2 text-ink">Import your business context</h1>
        <p className="text-body text-graphite">
          Trochia drafts your Business Memory from a paste of your AI context (ChatGPT / Claude /
          Notion). Edit, confirm, or reject each field before saving.
        </p>
      </header>
      <PasteFlow />
    </main>
  );
}
