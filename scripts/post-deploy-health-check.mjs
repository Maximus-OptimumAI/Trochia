/**
 * Post-deploy AI health-check trigger.
 *
 * Run as the `postbuild` npm script (i.e. after every `next build` / Vercel deploy):
 * sends the `ai/health-check.requested` Inngest event so the `ai-health-check`
 * function fires a ~10-token Haiku ping through `ai/client.ts`, producing a real
 * Langfuse trace per deploy (cache-hit-rate, tokens, latency, cost) — XC-06.
 *
 * Best-effort: if Inngest isn't configured (no INNGEST_EVENT_KEY — e.g. a local
 * `next build` with no Inngest Dev Server), it logs and exits 0. It never fails the
 * build. The function is also manually triggerable via
 * `inngest.send({ name: 'ai/health-check.requested' })`.
 */
import { Inngest } from 'inngest';

async function main() {
  const eventKey = process.env.INNGEST_EVENT_KEY;
  if (!eventKey) {
    console.log('post-deploy-health-check: INNGEST_EVENT_KEY not set — skipping (not a deploy env).');
    return;
  }
  try {
    const inngest = new Inngest({ id: 'trochia', eventKey });
    await inngest.send({ name: 'ai/health-check.requested', data: { trigger: 'postbuild' } });
    console.log('post-deploy-health-check: sent ai/health-check.requested.');
  } catch (err) {
    console.warn('post-deploy-health-check: failed to send event (non-fatal):', err?.message ?? err);
  }
}

main();
