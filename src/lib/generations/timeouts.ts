// Browser-safe budgets. Submit includes upload, provider acknowledgement and database work.
export const GENERATION_TIMEOUTS = {
  providerReadMs: 15_000,
  providerSubmitMs: 60_000,
  browserSubmitMs: 180_000,
} as const;
