export const GENERATION_STATUSES = ['reserved', 'submitting', 'unknown', 'queued', 'processing', 'done', 'failed', 'rejected'] as const;
export type GenerationStatus = typeof GENERATION_STATUSES[number];
export const VIDEO_STATES = ['pending', 'finalizing', 'ready', 'needs_review', 'expired'] as const;
export type VideoState = typeof VIDEO_STATES[number];
export type Generation = { videoState?: VideoState; slotReleasedAt?: string | null; id: string; status: GenerationStatus; expiresAt: string; refunded: boolean; releasedAt?: string | null; releaseAfter?: string | null };
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseGeneration(value: unknown): Generation {
  if (!value || typeof value !== 'object') throw new Error('invalid_generation');
  const data = value as Record<string, unknown>;
  if (typeof data.id !== 'string' || !UUID.test(data.id) || !GENERATION_STATUSES.includes(data.status as GenerationStatus) ||
    typeof data.expiresAt !== 'string' || !Number.isFinite(Date.parse(data.expiresAt)) || typeof data.refunded !== 'boolean' || (data.refunded && !['failed', 'rejected'].includes(String(data.status)))) throw new Error('invalid_generation');
  if (data.videoState !== undefined && !VIDEO_STATES.includes(data.videoState as VideoState)) throw new Error('invalid_video_state');
  if (data.slotReleasedAt != null && (typeof data.slotReleasedAt !== 'string' || !Number.isFinite(Date.parse(data.slotReleasedAt)) || Date.parse(data.slotReleasedAt) < Date.parse(data.expiresAt) || !['queued','processing','done','failed'].includes(String(data.status)))) throw new Error('invalid_slot_release');
  for (const field of ['releasedAt', 'releaseAfter']) {
    if (data[field] != null && (typeof data[field] !== 'string' || !Number.isFinite(Date.parse(data[field] as string)) || data.status !== 'unknown' || data.refunded)) throw new Error('invalid_generation_release');
  }
  if (data.releasedAt && data.releaseAfter) throw new Error('invalid_generation_release');
  return { ...(data.slotReleasedAt !== undefined ? { slotReleasedAt: data.slotReleasedAt as string | null } : {}), ...(data.videoState !== undefined ? { videoState: data.videoState as VideoState } : {}), id: data.id, status: data.status as GenerationStatus, expiresAt: data.expiresAt, refunded: data.refunded,
    releasedAt: data.releasedAt as string | null | undefined, releaseAfter: data.releaseAfter as string | null | undefined };
}

export function parseRequestedGeneration(value: unknown, requestId: string): Generation {
  const generation = parseGeneration(value);
  if (generation.id !== requestId) throw new Error('request_mismatch');
  return generation;
}

// The server, never a browser timer, decides when the account slot is released.
export function canGenerateAgain(generation: Generation) {
  return Boolean(generation.slotReleasedAt) || ['done', 'failed', 'rejected'].includes(generation.status) || (generation.status === 'unknown' && Boolean(generation.releasedAt));
}


export function shouldPollGeneration(generation: Generation) {
  return !canGenerateAgain(generation) || (generation.status === 'done' && generation.videoState !== undefined && !['ready','needs_review','expired'].includes(generation.videoState));
}
