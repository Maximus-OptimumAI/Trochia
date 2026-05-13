import { DeckStep } from './deck-step';

/**
 * Onboarding step 2 — Deck upload (Plan 01-09, FND-12).
 *
 * UI-SPEC §"Onboarding step 2": heading "Upload your deck" · body "PDF, PPTX,
 * or a Google Slides link. Trochia reviews it next."
 *
 * Phase 1 ships the SHELL: PDF/PPTX dropzone + Google Slides URL input +
 * Continue/Skip. Deck parsing + review logic lands in Phase 3 (Pitch Lab).
 *
 * Fires `deck_upload_step_viewed` on mount.
 */
export default function DeckPage() {
  return <DeckStep />;
}
