import 'server-only';
import { generationLog, observeGeneration } from './log';
import { randomUUID } from 'node:crypto';
import { createNexabotClient, NexabotError, type VideoRequest } from '../nexabot/client';
import { canGenerateAgain, parseGeneration } from './types';
import { GenerationError } from './input';
import type { GenerationStore, StoredGeneration } from './store';
export function createGenerationFlow(rawStore: GenerationStore, provider: ReturnType<typeof createNexabotClient>) {
  const store: GenerationStore = { operation: (action, userId, id, data) => observeGeneration(`database_${action}`, id, () => rawStore.operation(action, userId, id, data)) };
  async function save(userId: string, id: string, data: Record<string, unknown>) {
    // Retrying a database transition is safe; this never retries the provider POST.
    try { return await store.operation('transition', userId, id, data); }
    catch { return store.operation('transition', userId, id, data); }
  }
  async function status(userId: string, id: string, reconcile = false) {
    const generation = await store.operation(reconcile ? 'reconcile' : 'poll', userId, id);
    if (!generation.pollAllowed || !generation.providerJobId) return parseGeneration(generation);
    let job;
    try { job = await observeGeneration('provider_poll', id, () => provider.getJob(generation.providerJobId!), false); }
    catch { return { ...parseGeneration(generation), pollUnavailable: true }; }
    const saved = await save(userId, id, { status: job.status, providerJobId: generation.providerJobId });
    if (['done', 'failed'].includes(saved.status)) generationLog('generation_outcome', { requestId: id, status: saved.status, providerJobId: generation.providerJobId });
    return parseGeneration(saved);
  }
  return {
    async submit(userId: string, requestId: string, input: VideoRequest, hash: string) {
      // Retries of an existing ID must read the existing reservation even if the provider is now unavailable.
      let existing: StoredGeneration | undefined;
      try { existing = await store.operation('read', userId, requestId); }
      catch (error) { if (!(error instanceof GenerationError) || error.code !== 'not_found') throw error; }
      if (!existing) {
        const credit = await observeGeneration('provider_credit', requestId, () => provider.getCredit(), true);
        if (credit.creditCost !== 0.15 || credit.credit < credit.creditCost) throw new GenerationError('provider_unavailable');
      }
      const details = { hash, mode: input.mode, prompt: input.prompt, orientation: input.orientation, resolution: Number(input.resolution) };
      let generation;
      try { generation = await store.operation('reserve', userId, requestId, details); }
      catch (error) {
        if (error instanceof GenerationError && error.code === 'active_generation' && error.activeId) {
          // Reconcile an owned known job after refresh; no history restore or provider POST retry.
          const previous = await status(userId, error.activeId, true);
          if (!canGenerateAgain(previous)) throw error;
        }
        generation = await store.operation('reserve', userId, requestId, details);
      }
      if (generation.status !== 'reserved') return parseGeneration(generation);
      if (existing) {
        try {
          const credit = await observeGeneration('provider_credit', requestId, () => provider.getCredit(), true);
          if (credit.creditCost !== 0.15 || credit.credit < credit.creditCost) throw new GenerationError('provider_unavailable');
        } catch {
          // Cancel only if still unclaimed; a competing claimant's job is never refunded here.
          let cancelled;
          try { cancelled = await store.operation('cancel', userId, requestId); }
          catch { cancelled = await store.operation('cancel', userId, requestId); }
          return parseGeneration(cancelled);
        }
      }
      const claimToken = randomUUID();
      let claim;
      try { claim = await store.operation('claim', userId, requestId, { claimToken }); }
      catch { claim = await store.operation('claim', userId, requestId, { claimToken }); }
      if (!claim.claimAllowed) return parseGeneration(claim);
      let accepted;
      try { accepted = await observeGeneration('provider_submit', requestId, () => provider.submitVideo(input, transport => generationLog('provider_transport', { requestId, transport })), true); }
      catch (error) {
        const status = error instanceof NexabotError && error.outcome === 'rejected' ? 'rejected' : 'unknown';
        const saved = await save(userId, requestId, { status, claimToken });
        generationLog('generation_outcome', { requestId, status: saved.status });
        return parseGeneration(saved);
      }
      // If persistence fails after acceptance, preserve the reservation; never refund/resubmit.
      return parseGeneration(await save(userId, requestId, { status: 'queued', providerJobId: accepted.jobId, claimToken }));
    },
    status,
  };
}
