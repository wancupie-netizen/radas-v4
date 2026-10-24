export const GENERATION_STATUSES = ['reserved', 'submitting', 'unknown', 'queued', 'processing', 'done', 'failed', 'rejected'] as const;
export type GenerationStatus = typeof GENERATION_STATUSES[number];
export type Generation = { id: string; status: GenerationStatus; expiresAt: string; refunded: boolean; releasedAt?: string | null; releaseAfter?: string | null };
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseGeneration(value: unknown): Generation {
  if (!value || typeof value !== 'object') throw new Error('invalid_generation');
  const data = value as Record<string, unknown>;
  if (typeof data.id !== 'string' || !UUID.test(data.id) || !GENERATION_STATUSES.includes(data.status as GenerationStatus) ||
    typeof data.expiresAt !== 'string' || !Number.isFinite(Date.parse(data.expiresAt)) || typeof data.refunded !== 'boolean' || (data.refunded && !['failed', 'rejected'].includes(String(data.status)))) throw new Error('invalid_generation');
  for (const field of ['releasedAt', 'releaseAfter']) {
    if (data[field] != null && (typeof data[field] !== 'string' || !Number.isFinite(Date.parse(data[field] as string)) || data.status !== 'unknown' || data.refunded)) throw new Error('invalid_generation_release');
  }
  if (data.releasedAt && data.releaseAfter) throw new Error('invalid_generation_release');
  return { id: data.id, status: data.status as GenerationStatus, expiresAt: data.expiresAt, refunded: data.refunded,
    releasedAt: data.releasedAt as string | null | undefined, releaseAfter: data.releaseAfter as string | null | undefined };
}

export function parseRequestedGeneration(value: unknown, requestId: string): Generation {
  const generation = parseGeneration(value);
  if (generation.id !== requestId) throw new Error('request_mismatch');
  return generation;
}

// The server, never a browser timer, decides when the account slot is released.
export function canGenerateAgain(generation: Generation) {
  return ['done', 'failed', 'rejected'].includes(generation.status) || (generation.status === 'unknown' && Boolean(generation.releasedAt));
}
