export async function register() {
  // Build/production instances never create a background interval. Serverless production needs an external scheduler.
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NODE_ENV === 'development' && process.env.RADAS_CLEANUP_ENABLED === 'true') {
    const { startLocalCleanup } = await import('./lib/cleanup/local'); startLocalCleanup();
  }
}
