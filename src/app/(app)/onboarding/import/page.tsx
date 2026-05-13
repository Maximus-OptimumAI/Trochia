import { ImportStep } from './import-step';

/**
 * Onboarding step 1 — Knowledge Pack Import (Plan 01-09, FND-12).
 *
 * UI-SPEC §"Auth + onboarding shell" / "Onboarding step 1":
 *   heading "Import your context" · body "Drop in your existing AI context —
 *   ChatGPT instructions, Claude project notes, a Notion brief — or paste
 *   500–5,000 words. Trochia builds your Business Memory from it."
 *
 * Phase 1 ships the SHELL: paste textarea + file dropzone + Continue/Skip
 * buttons. Feature logic (the actual extraction → Business Memory) lands in
 * Phase 2. The Continue/Skip buttons advance `accounts.onboarding_step` via
 * `onboarding.markStepComplete` / `onboarding.skipStep` and route to step 2.
 *
 * Fires `knowledge_pack_step_viewed` on mount (Plan-05 analytics taxonomy).
 */
export default function ImportPage() {
  return <ImportStep />;
}
