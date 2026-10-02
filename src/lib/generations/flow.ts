import 'server-only';
import { createNexabotClient, NexabotError, type VideoRequest } from '../nexabot/client';
import { parseGeneration } from './types';
import { GenerationError } from './input';
import type { GenerationStore, StoredGeneration } from './store';
export function createGenerationFlow(store: GenerationStore, provider: ReturnType<typeof createNexabotClient>) {
  async function save(userId: string, id: string, data: Record<string, unknown>) {
    // Retrying a database transition is safe; this never retries the provider POST.
    try { return await store.operation('transition', userId, id, data); }
    catch { return store.operation('transition', userId, id, data); }
  }
  return {
    async submit(userId: string, requestId: string, input: VideoRequest, hash: string) {
      // Retries of an existing ID must read the existing reservation even if the provider is now unavailable.
      let existing: StoredGeneration | undefined;
      try { existing = await store.operation('read', userId, requestId); }
      catch (error) { if (!(error instanceof GenerationError) || error.code !== 'not_found') throw error; }
      if (!existing) {
        const credit = await provider.getCredit();
        if (credit.creditCost !== 0.15 || credit.credit < credit.creditCost) throw new GenerationError('provider_unavailable');
      }
      const generation = await store.operation('reserve', userId, requestId, { hash, mode: input.mode, prompt: input.prompt, orientation: input.orientation, resolution: Number(input.resolution) });
      if (!generation.created) return parseGeneration(generation);
      let accepted;
      try { accepted = await provider.submitVideo(input); }
      catch (error) {
        const status = error instanceof NexabotError && error.outcome === 'rejected' ? 'rejected' : 'unknown';
        return parseGeneration(await save(userId, requestId, { status }));
      }
      // If persistence fails after acceptance, preserve the reservation; never refund/resubmit.
      return parseGeneration(await save(userId, requestId, { status: 'queued', providerJobId: accepted.jobId }));
    },
    async status(userId: string, id: string) {
      const generation = await store.operation('poll', userId, id);
      if (!generation.pollAllowed || !generation.providerJobId) return parseGeneration(generation);
      let job;
      try { job = await provider.getJob(generation.providerJobId); }
      catch { return { ...parseGeneration(generation), pollUnavailable: true }; }
      return parseGeneration(await save(userId, id, { status: job.status, providerJobId: generation.providerJobId }));
    },
  };
}
