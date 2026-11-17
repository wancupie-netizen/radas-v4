export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.RADAS_FINALIZATION_ENABLED === 'true' && process.env.NEXT_PHASE !== 'phase-production-build') {
    const { startFinalization } = await import('./lib/finalization/runner'); startFinalization();
  }
  // Build/production instances never create a background interval. Serverless production needs an external scheduler.
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NODE_ENV === 'development' && process.env.RADAS_CLEANUP_ENABLED === 'true') {
    const { startLocalCleanup } = await import('./lib/cleanup/local'); startLocalCleanup();
  }
}
