import { ReviewStep } from './review-step';

/**
 * Onboarding step 3 — Automatic deck review (Plan 01-09, FND-12).
 *
 * UI-SPEC §"Onboarding step 3": heading "Reviewing your deck…" · body "This
 * takes about a minute. We'll take you to your dashboard when it's done."
 *
 * Phase 1 ships the SHELL: SkeletonBlock-based progress mock (NOT a spinner —
 * UI-SPEC anti-pattern bans spinners as the primary full-page loading
 * affordance). The actual review logic ships in Phase 3 (Pitch Lab).
 *
 * On mount: fires `review_step_viewed`, then auto-advances after a short beat
 * (calls `onboarding.markStepComplete({ step: 'review' })`, which sets
 * `onboarding_completed_at`) and routes to `/app`.
 */
export default function ReviewPage() {
  return <ReviewStep />;
}
