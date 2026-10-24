import { requestJson, RequestError } from '../errors/client';
import { GENERATION_TIMEOUTS } from './timeouts';

// Checking never uploads media. A missing record may race with the original POST:
// explicitly retry the SAME ID/form, relying on atomic reserve + private claim.
export async function recoverGeneration(id: string, form: FormData, read = requestJson) {
  try { return await read(`/api/generations/${id}`); }
  catch (error) {
    if (!(error instanceof RequestError) || error.status !== 404 || error.code !== 'not_found') throw error;
    return read('/api/generations', { method: 'POST', body: form }, GENERATION_TIMEOUTS.browserSubmitMs);
  }
}
