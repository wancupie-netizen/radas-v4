// Browser-safe errors: never display raw server/provider text or retry a write automatically.
export class RequestError extends Error {
  constructor(public readonly code = 'unavailable', public readonly status = 0) { super(code); }
}
export async function requestJson(url: string, init: RequestInit = {}, timeout = 20_000): Promise<Record<string, unknown>> {
  // Older Safari supports AbortController but not AbortSignal.timeout/any.
  const controller = new AbortController();
  const callerSignal = init.signal;
  const abort = () => controller.abort();
  const timer = setTimeout(abort, timeout);
  if (callerSignal?.aborted) abort();
  else callerSignal?.addEventListener('abort', abort, { once: true });
  try {
    if (controller.signal.aborted) throw new RequestError();
    const response = await fetch(url, { ...init, cache: 'no-store', signal: controller.signal });
    if (response.status === 401) throw new RequestError('unauthorized', 401);
    const data: unknown = await response.json();
    if (!response.ok) throw new RequestError(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : 'unavailable', response.status);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new RequestError();
    return data as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError();
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', abort);
  }
}
const generationMessages: Record<string, string> = {
 rate_limited: "Too many requests. Wait up to 60 seconds, then check the same request; do not submit a new video request.",
 insufficient_credits: "Insufficient credits. Top up or check your balance before generating a video.",
 active_generation: "A previous generation is still active or being checked. Please wait briefly and check again.",
 provider_unavailable: "Video generation is currently unavailable. This request did not use any credits. Please try again later.",
 invalid_image: "The image is invalid or could not be read. Choose another image.",
 invalid_input: "Check your prompt and video settings.", image_too_large: "The upload is too large. Use up to 3 images, no larger than 10 MB each.",
 generation_disabled: "Video generation is not enabled.", forbidden: "This request is not allowed. Check your login session and try again.",
 request_conflict: "The request reference does not match. Contact support with this reference."
};
const safeToRelease = new Set(['insufficient_credits','active_generation','provider_unavailable','invalid_image','invalid_input','image_too_large','generation_disabled','forbidden']);
export function generationIssue(error: unknown) {
 const code = error instanceof RequestError ? error.code : 'unavailable';
 return { retainRequest: !safeToRelease.has(code), message: generationMessages[code] ?? "The response has not yet been confirmed. Check the request again using the same reference; do not submit a new video request." };
}
export function paymentIssue(error: unknown, writing: boolean) {
 if (error instanceof RequestError) {
  if (error.code === 'rate_limited') return "Too many payment requests. Wait up to 60 seconds and check the status; do not pay again.";
  if (error.status === 403) return "Payment access is not allowed for this account or session.";
  if (error.code === 'payments_disabled') return "Top ups are currently unavailable. Please check again later.";
  if (error.code === 'invalid_request') return "Check the payment amount and reference you entered.";
  if (error.code === 'payment_conflict') return "The order or reference does not match the current status. Check the status first; do not pay again.";
 }
 return writing ? "The payment response has not yet been confirmed. Check the status first; do not pay again. The original reference has been retained." : "The payment status could not be loaded. Please check again; do not pay again.";
}
