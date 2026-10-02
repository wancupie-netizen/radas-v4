import type { Generation } from '../generations/types';
import type { VideoMode, VideoOrientation, VideoResolution } from '../video/input';
export const RECENT_LIMIT = 20;
export type RecentDetails = { id: string; prompt: string; mode: VideoMode; orientation: VideoOrientation; resolution: VideoResolution };
export type RecentVideo = RecentDetails & { generation: Generation; completedAt: string };
export function pruneRecent(items: RecentVideo[], now: number): RecentVideo[] {
  const next = items.filter(item => item.generation.status === 'done' && !item.generation.refunded && Date.parse(item.generation.expiresAt) > now);
  return next.length === items.length ? items : next;
}
export function rememberRecent(items: RecentVideo[], generation: Generation, details: RecentDetails, now: number): RecentVideo[] {
  const current = pruneRecent(items, now);
  if (generation.id !== details.id || generation.status !== 'done' || generation.refunded || !(Date.parse(generation.expiresAt) > now)) return current;
  if (current.some(item => item.id === generation.id)) return current;
  return [{ ...details, generation: { ...generation }, completedAt: new Date(now).toISOString() }, ...current].slice(0, RECENT_LIMIT);
}
