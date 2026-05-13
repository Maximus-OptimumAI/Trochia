'use client';

/**
 * HeroTimeline — the homepage hero's sole live element.
 *
 * Renders the raise-timeline sequence (Memory → Pitch Lab → Pipeline → Live
 * Raise → Close) as a row of labelled nodes connected by arrows. Each node
 * illuminates sequentially (Ink → Signal), 800ms per step, looping with a 2s
 * pause at the end (UI-SPEC §Motion Contract).
 *
 * Built with the `motion` package (NOT `framer-motion`). Respects
 * `prefers-reduced-motion: reduce` via `useReducedMotion()` — when reduced, the
 * component renders a static composition (all nodes in their resting state, no
 * animation, no transition delay).
 *
 * Founder decision 2026-05-12: this is the SOLE hero live element. No
 * secondary "live output" card.
 */
import { motion, useReducedMotion } from 'motion/react';

const STEPS = ['Memory', 'Pitch Lab', 'Pipeline', 'Live Raise', 'Close'] as const;

// Brand tokens (mirrored here as literals so the keyframe animation can interpolate
// across colors — Tailwind classes can't be interpolated by framer-motion).
const TOKEN_INK = '#0A0E1A';
const TOKEN_PAPER = '#FAFAF7';
const TOKEN_STONE = '#ECEAE3';
const TOKEN_GRAPHITE = '#6B7280';
const TOKEN_SIGNAL = '#F25C2A';

const STEP_DURATION_S = 0.8;
const PAUSE_S = 2;

export function HeroTimeline() {
  const reduced = useReducedMotion();

  return (
    <div
      aria-label="Raise timeline: Memory, Pitch Lab, Pipeline, Live Raise, Close"
      className="flex flex-wrap items-center justify-center gap-x-2 gap-y-3 md:justify-start"
    >
      {STEPS.map((label, i) => (
        <span key={label} className="flex items-center gap-2">
          <motion.span
            className="rounded-full border border-stone px-3 py-1.5 text-mono-sm font-medium"
            initial={false}
            animate={
              reduced
                ? { backgroundColor: TOKEN_PAPER, color: TOKEN_INK, borderColor: TOKEN_STONE }
                : {
                    backgroundColor: [TOKEN_PAPER, TOKEN_INK, TOKEN_SIGNAL, TOKEN_PAPER],
                    color: [TOKEN_GRAPHITE, TOKEN_PAPER, TOKEN_PAPER, TOKEN_GRAPHITE],
                    borderColor: [TOKEN_STONE, TOKEN_INK, TOKEN_SIGNAL, TOKEN_STONE],
                  }
            }
            transition={
              reduced
                ? { duration: 0 }
                : {
                    duration: STEP_DURATION_S,
                    delay: i * STEP_DURATION_S,
                    repeat: Infinity,
                    repeatDelay:
                      PAUSE_S + (STEPS.length - 1 - i) * STEP_DURATION_S,
                    ease: 'easeInOut',
                  }
            }
          >
            {label}
          </motion.span>
          {i < STEPS.length - 1 && (
            <span aria-hidden className="text-graphite">
              →
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
