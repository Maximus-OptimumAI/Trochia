/**
 * Model router — picks the Anthropic model by task class.
 *
 * Task classes (cheapest → most capable):
 *   - `classify` → Haiku 4.5  — cheap classification, polling, health-check pings, cheap Q&A
 *   - `draft`    → Sonnet 4.6 — high-volume production drafting (outreach, application answers, follow-ups)
 *   - `reason`   → Opus 4.7   — deep reasoning (deck review, pre-call brief synthesis, scoring)
 *
 * The model IDs are named constants so a model bump is a one-line edit here. Verify
 * against the current Anthropic model list (platform.claude.com/docs/about-claude/models)
 * when bumping — these are the GA IDs as of the Phase-1 build.
 */

/** Haiku 4.5 — cheap classification / polling / health-check. */
export const HAIKU_MODEL = 'claude-haiku-4-5' as const;
/** Sonnet 4.6 — high-volume production drafting. */
export const SONNET_MODEL = 'claude-sonnet-4-6' as const;
/** Opus 4.7 — deep reasoning. */
export const OPUS_MODEL = 'claude-opus-4-7' as const;

export type TaskClass = 'classify' | 'draft' | 'reason';

/** Map a task class to the Anthropic model id. */
export function pickModel(taskClass: TaskClass): string {
  switch (taskClass) {
    case 'classify':
      return HAIKU_MODEL;
    case 'draft':
      return SONNET_MODEL;
    case 'reason':
      return OPUS_MODEL;
    default: {
      // Exhaustiveness guard — a new TaskClass must add a branch above.
      const _never: never = taskClass;
      throw new Error(`Unknown task class: ${String(_never)}`);
    }
  }
}
