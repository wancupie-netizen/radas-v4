import type { Generation } from './types';

export type AttemptSummary = { consecutiveUnknown: number; outcomes: ReadonlyMap<string, 'unknown' | 'done'> };
export function emptyAttemptSummary(): AttemptSummary {
  return { consecutiveUnknown: 0, outcomes: new Map() };
}

// Page-session guidance only. Polls/recoveries of the same ID are not new attempts.
export function observeAttempt(previous: AttemptSummary, generation: Generation): AttemptSummary {
  if (generation.status !== 'unknown' && generation.status !== 'done') return previous;
  const observed = previous.outcomes.get(generation.id);
  if (observed === generation.status || observed === 'done') return previous;
  const outcomes = new Map(previous.outcomes);
  outcomes.set(generation.id, generation.status);
  return { outcomes, consecutiveUnknown: generation.status === 'done' ? 0 : Math.min(3, previous.consecutiveUnknown + 1) };
}

export function waitSeconds(releaseAfter: string | null | undefined, now: number | null): number | null {
  if (!releaseAfter || now === null) return null;
  const deadline = Date.parse(releaseAfter);
  return Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
}
export function formatWait(seconds: number): string {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
