import 'server-only';
import { createCleanupClient, createCleanupRunner, requireCleanupEnabled } from './run';
export function startLocalCleanup() {
  if (process.env.NODE_ENV !== 'development' || process.env.RADAS_CLEANUP_ENABLED !== 'true') return;
  const state = globalThis as typeof globalThis & { radasV4CleanupStarted?: boolean };
  if (state.radasV4CleanupStarted) return;
  state.radasV4CleanupStarted = true;
  async function tick() {
    try {
      requireCleanupEnabled(); const result = await createCleanupRunner(createCleanupClient()).run();
      console.info(`RADAS_CLEANUP=${result.status.toUpperCase()} removed=${result.removed} metadataPruned=${result.metadataPruned}`);
    } catch { console.warn('RADAS_CLEANUP=FAILED (check Phase 10 configuration/SQL; no secret details logged)'); }
    finally { const timer = setTimeout(tick, 5 * 60_000); timer.unref(); }
  }
  const timer = setTimeout(tick, 1000); timer.unref();
}
