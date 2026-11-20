import 'server-only';
import { randomUUID } from 'node:crypto';
import { createNexabotClient, NexabotError } from '../nexabot/client';
import { createGenerationStore } from '../generations/store';
import { GenerationError } from '../generations/input';
import { generationLog } from '../generations/log';
import { UUID } from '../generations/types';
import { createVideoStorage } from '../storage/video';
import { createFinalizationClient, finalizationOperation, finalizationEnabled, type FinalizationClient } from './client';

type Dependencies = {
  client: FinalizationClient;
  provider: Pick<ReturnType<typeof createNexabotClient>, 'getJob'>;
  store: ReturnType<typeof createGenerationStore>;
  storage: (signal: AbortSignal, guard: () => Promise<void>) => Pick<ReturnType<typeof createVideoStorage>, 'ensure' | 'readStored'>;
};
// No submitVideo/getCredit/debit/refund operation: only existing jobs are read.
export function createFinalizationRunner(deps: Dependencies) {
  return { async tick(): Promise<'idle' | 'handled'> {
    const token = randomUUID();
    const claim = await finalizationOperation(deps.client, 'claim', null, null, token);
    if (claim.claimed === false) return 'idle';
    if (claim.claimed !== true || typeof claim.id !== 'string' || !UUID.test(claim.id) || typeof claim.userId !== 'string' || !UUID.test(claim.userId) ||
        typeof claim.providerJobId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(claim.providerJobId) || !['queued','processing','done'].includes(String(claim.status))) throw new GenerationError('unavailable');
    const { id, userId, providerJobId } = claim as { id: string; userId: string; providerJobId: string };
    const started = performance.now();
    const signal = AbortSignal.timeout(300_000);
    const guard = async () => {
      signal.throwIfAborted();
      const lease = await finalizationOperation(deps.client, 'guard', userId, id, token);
      if (lease.valid !== true) throw new GenerationError('unavailable');
    };
    try {
      await guard();
      let status = String(claim.status);
      if (status !== 'done') {
        const job = await deps.provider.getJob(providerJobId);
        await guard();
        const saved = await deps.store.operation('transition', userId, id, { status: job.status, providerJobId });
        status = saved.status;
      }
      if (status === 'done') {
        const storage = deps.storage(signal, guard);
        await storage.ensure(userId, id, signal);
        await guard();
        // Verify the stored object through the same read path as RADAS playback.
        await storage.readStored(userId, id, signal);
        await guard();
        const result = await finalizationOperation(deps.client, 'ready', userId, id, token);
        if (result.applied !== true) throw new GenerationError('unavailable');
      } else {
        const result = await finalizationOperation(deps.client, status === 'failed' ? 'terminal' : 'wait', userId, id, token);
        if (result.applied !== true) throw new GenerationError('unavailable');
      }
      generationLog('video_finalize', { requestId: id, durationMs: performance.now() - started });
    } catch (error) {
      generationLog('video_finalize', { requestId: id, error, durationMs: performance.now() - started });
      // A polling 404/timeout never changes generation status or refunds.
      const unsafe = error instanceof NexabotError && error.code === 'UNSAFE_DOWNLOAD_REDIRECT';
      await finalizationOperation(deps.client, unsafe ? 'review' : 'retry', userId, id, token);
    }
    return 'handled';
  } };
}

export function startFinalization() {
  if (!finalizationEnabled() || process.env.RADAS_GENERATION_ENABLED !== 'true' || process.env.NEXT_PHASE === 'phase-production-build') return;
  // Opt-in for an always-running Node service, never a request-frozen/serverless host.
  const state = globalThis as typeof globalThis & { radasFinalizationStarted?: boolean };
  if (state.radasFinalizationStarted) return;
  state.radasFinalizationStarted = true;
  const tick = async () => {
    try {
      if (!finalizationEnabled() || process.env.RADAS_GENERATION_ENABLED !== 'true') return;
      const runner = createFinalizationRunner({ client: createFinalizationClient(), provider: createNexabotClient(), store: createGenerationStore(),
        storage: (signal, guard) => createVideoStorage({ signal, guard }) });
      await runner.tick();
    } catch (error) { generationLog('video_finalize', { error }); }
    finally { const timer = setTimeout(tick, 4000); timer.unref(); }
  };
  const timer = setTimeout(tick, 1000); timer.unref();
}
