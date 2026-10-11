import 'server-only';
import { NexabotError } from '../nexabot/client';
import { GenerationError } from './input';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const stages = new Set(['request_auth','request_input','request_submit','request_status','database_read','database_reserve','database_claim','database_cancel','database_transition','database_poll','database_reconcile','provider_credit','provider_submit','provider_poll','generation_outcome']);
const codes = new Set(['unavailable','unauthorized','forbidden','generation_disabled','rate_limited','invalid_input','invalid_image','image_too_large','insufficient_credits','active_generation','request_conflict','not_found','expired','provider_unavailable','TIMEOUT','INVALID_INPUT','MISSING_OR_INVALID_KEY','INVALID_OR_UNAVAILABLE_RESPONSE','UNSAFE_DOWNLOAD_REDIRECT']);
type Entry = { requestId?: string; error?: unknown; durationMs?: number; providerJobId?: string | null; status?: string; sqlState?: string };
// Deliberate field allowlist: never serialize errors, request bodies, prompts, media, keys or customer identity.
export function generationLog(stage: string, entry: Entry = {}) {
  try {
    if (!stages.has(stage)) return;
    const error = entry.error;
    const record: Record<string, string | number> = { event: 'radas_generation', stage, timestamp: new Date().toISOString(), result: error ? 'error' : 'ok' };
    if (entry.requestId && UUID.test(entry.requestId)) record.requestId = entry.requestId;
    if (typeof entry.durationMs === 'number' && Number.isFinite(entry.durationMs)) record.durationMs = Math.max(0, Math.round(entry.durationMs));
    if (entry.providerJobId && /^[A-Za-z0-9_-]{1,128}$/.test(entry.providerJobId)) record.providerJobId = entry.providerJobId;
    if (entry.status && ['reserved','submitting','queued','processing','done','failed','rejected','unknown'].includes(entry.status)) record.status = entry.status;
    if (entry.sqlState && /^[0-9A-Z]{5}$/.test(entry.sqlState)) record.sqlState = entry.sqlState;
    if (error instanceof GenerationError) {
      record.code = codes.has(error.code) ? error.code : 'unavailable';
      record.httpStatus = error.status;
      if (error.activeId && UUID.test(error.activeId)) record.activeGenerationId = error.activeId;
    } else if (error instanceof NexabotError) {
      record.code = codes.has(error.code) || /^HTTP_[1-5][0-9]{2}$/.test(error.code) ? error.code : 'unavailable';
      record.outcome = error.outcome;
      if (error.diagnostic) {
        if (['timeout','network','http','invalid_response'].includes(error.diagnostic.kind)) record.kind = error.diagnostic.kind;
        if (Number.isInteger(error.diagnostic.httpStatus) && error.diagnostic.httpStatus! >= 100 && error.diagnostic.httpStatus! <= 599) record.httpStatus = error.diagnostic.httpStatus!;
      }
    } else if (error) record.code = 'unavailable';
    console.info(JSON.stringify(record));
  } catch { /* Logging must never alter generation/credit behavior. */ }
}
export async function observeGeneration<T>(stage: string, requestId: string, action: () => Promise<T>, logSuccess = false): Promise<T> {
  const started = performance.now();
  try {
    const result = await action();
    if (logSuccess) {
      const jobId = result && typeof result === 'object' && 'jobId' in result ? result.jobId : undefined;
      generationLog(stage, { requestId, durationMs: performance.now() - started, providerJobId: typeof jobId === 'string' ? jobId : undefined });
    }
    return result;
  } catch (error) {
    if (!(stage === 'database_read' && error instanceof GenerationError && error.code === 'not_found')) generationLog(stage, { requestId, error, durationMs: performance.now() - started });
    throw error;
  }
}
