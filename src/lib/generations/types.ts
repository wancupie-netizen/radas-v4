export const GENERATION_STATUSES = ['reserved', 'submitting', 'unknown', 'queued', 'processing', 'done', 'failed', 'rejected'] as const;
export type GenerationStatus = typeof GENERATION_STATUSES[number];
export type Generation = { id: string; status: GenerationStatus; expiresAt: string; refunded: boolean };
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseGeneration(value: unknown): Generation {
  if (!value || typeof value !== 'object') throw new Error('invalid_generation');
  const data = value as Record<string, unknown>;
  if (typeof data.id !== 'string' || !UUID.test(data.id) || !GENERATION_STATUSES.includes(data.status as GenerationStatus) ||
    typeof data.expiresAt !== 'string' || !Number.isFinite(Date.parse(data.expiresAt)) || typeof data.refunded !== 'boolean' || (data.refunded && !['failed', 'rejected'].includes(String(data.status)))) throw new Error('invalid_generation');
  return { id: data.id, status: data.status as GenerationStatus, expiresAt: data.expiresAt, refunded: data.refunded };
}

export function parseRequestedGeneration(value: unknown, requestId: string): Generation {
  const generation = parseGeneration(value);
  if (generation.id !== requestId) throw new Error('request_mismatch');
  return generation;
}
