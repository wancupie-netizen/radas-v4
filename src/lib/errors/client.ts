// Browser-safe errors: never display raw server/provider text or retry a write automatically.
export class RequestError extends Error {
  constructor(public readonly code = 'unavailable', public readonly status = 0) { super(code); }
}
export async function requestJson(url: string, init: RequestInit = {}, timeout = 20_000): Promise<Record<string, unknown>> {
  const signal = AbortSignal.timeout(timeout);
  try {
    const response = await fetch(url, { ...init, cache: 'no-store', signal: init.signal ? AbortSignal.any([init.signal, signal]) : signal });
    if (response.status === 401) throw new RequestError('unauthorized', 401);
    const data: unknown = await response.json();
    if (!response.ok) throw new RequestError(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : 'unavailable', response.status);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new RequestError();
    return data as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError();
  }
}
const generationMessages: Record<string, string> = {
 insufficient_credits: 'Credit tidak mencukupi. Top up atau semak baki sebelum generate.',
 active_generation: 'Masih ada generation aktif. Tunggu dan semak semula; hubungi sokongan jika berlarutan.',
 provider_unavailable: 'Generation belum tersedia. Request ini tidak menggunakan credit. Cuba semula kemudian.',
 invalid_image: 'Gambar tidak sah atau tidak dapat dibaca. Pilih gambar lain.',
 invalid_input: 'Semak prompt dan tetapan video.', image_too_large: 'Saiz gambar maksimum 10 MB.',
 generation_disabled: 'Generation belum diaktifkan.', forbidden: 'Request tidak dibenarkan. Semak sesi login dan cuba semula.',
 request_conflict: 'Rujukan request tidak sepadan. Hubungi sokongan menggunakan rujukan ini.'
};
const safeToRelease = new Set(['insufficient_credits','active_generation','provider_unavailable','invalid_image','invalid_input','image_too_large','generation_disabled','forbidden']);
export function generationIssue(error: unknown) {
 const code = error instanceof RequestError ? error.code : 'unavailable';
 return { retainRequest: !safeToRelease.has(code), message: generationMessages[code] ?? 'Respons belum dapat dipastikan. Semak request semula dengan rujukan yang sama; jangan submit video baharu.' };
}
export function paymentIssue(error: unknown, writing: boolean) {
 if (error instanceof RequestError) {
  if (error.status === 403) return 'Akses bayaran tidak dibenarkan untuk akaun atau sesi ini.';
  if (error.code === 'payments_disabled') return 'Top up belum tersedia. Cuba semak semula kemudian.';
  if (error.code === 'invalid_request') return 'Semak jumlah dan rujukan bayaran yang dimasukkan.';
  if (error.code === 'payment_conflict') return 'Pesanan atau rujukan tidak sepadan dengan status semasa. Semak status dahulu; jangan bayar semula.';
 }
 return writing ? 'Respons bayaran belum dapat dipastikan. Semak status dahulu; jangan bayar semula. Rujukan asal dikekalkan.' : 'Status bayaran belum dapat dimuatkan. Cuba semak semula; jangan bayar semula.';
}
