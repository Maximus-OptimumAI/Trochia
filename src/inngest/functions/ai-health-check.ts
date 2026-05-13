/**
 * `ai-health-check` — the deploy-time Haiku ping through `ai/client.ts`.
 *
 * Triggered by the `ai/health-check.requested` event. The repo ships a `postbuild`
 * npm script that fires that event after every `next build` (i.e. on every Vercel
 * deploy), and the function is also manually triggerable via
 * `inngest.send({ name: 'ai/health-check.requested' })`. Each run writes a `jobs`
 * row (a system job — `account_id IS NULL`, only reachable via `getServiceClient()`)
 * transitioning `queued → running → done | failed`, demonstrating the jobs-table
 * pattern, and exercises `ai/client.ts` so Langfuse captures a real trace per deploy
 * (once Plan 05's Langfuse keys are live) — XC-06.
 */
import { eq } from 'drizzle-orm';

import { aiHealthCheck } from '@/ai/health-check';
import { getServiceClient } from '@/db/client';
import { jobs } from '@/db/schema/jobs';
import { logger } from '@/lib/logger';

import { inngest } from '../client';

export const aiHealthCheckFn = inngest.createFunction(
  {
    id: 'ai-health-check',
    retries: 4,
    concurrency: { limit: 1 },
    triggers: [{ event: 'ai/health-check.requested' }],
  },
  async ({ step }) => {
    const jobId = await step.run('create-job-row', async () => {
      const db = getServiceClient();
      const [row] = await db
        .insert(jobs)
        .values({ type: 'ai-health-check', status: 'running', accountId: null })
        .returning({ id: jobs.id });
      return row.id;
    });

    try {
      const result = await step.run('haiku-ping', () => aiHealthCheck());
      await step.run('mark-done', async () => {
        const db = getServiceClient();
        await db.update(jobs).set({ status: 'done', result, updatedAt: new Date() }).where(eq(jobs.id, jobId));
      });
      return result;
    } catch (err) {
      await step.run('mark-failed', async () => {
        const db = getServiceClient();
        await db
          .update(jobs)
          .set({ status: 'failed', error: err instanceof Error ? err.message : String(err), updatedAt: new Date() })
          .where(eq(jobs.id, jobId));
      });
      logger.error('ai-health-check: Haiku ping failed', { jobId });
      throw err;
    }
  },
);
