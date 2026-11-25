import 'server-only';
import {isStorageUrl,pinnedStorageGet,StoragePolicyError} from './storage-download';
import { GENERATION_TIMEOUTS } from '../generations/timeouts';
import { validateImageFile, validatePrompt, VIDEO_INPUT, type VideoOrientation, type VideoResolution } from '../video/input';

const BASE = 'https://nexabot.id';
const DEFAULT_DOWNLOAD_ORIGINS = [
  'https://hrekuraxzpiqymgcrjyb.supabase.co',
  'https://iosrygyeustxztewibzq.supabase.co',
  'https://gvhsnjldhfczmylcagxe.supabase.co',
  'https://bwcqhtntrfntnkjokihp.supabase.co',
] as const;
function downloadOrigins(): ReadonlySet<string> {
  const raw = process.env.NEXABOT_DOWNLOAD_ORIGINS;
  if (!raw) return new Set(DEFAULT_DOWNLOAD_ORIGINS);
  let extra: unknown;
  try { extra = JSON.parse(raw); } catch { throw new NexabotError('UNSAFE_DOWNLOAD_REDIRECT', 'read', { kind: 'invalid_response', redirect: { reason: 'invalid_origin_config' } }); }
  // Explicit project origins only: no wildcard, path, query, userinfo or custom port.
  if (!Array.isArray(extra) || extra.length > 20 || extra.some(value => typeof value !== 'string' || !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(value))) throw new NexabotError('UNSAFE_DOWNLOAD_REDIRECT', 'read', { kind: 'invalid_response', redirect: { reason: 'invalid_origin_config' } });
  return new Set([...DEFAULT_DOWNLOAD_ORIGINS, ...extra]);
}
export type JobStatus = 'queued' | 'processing' | 'done' | 'failed';
export type VideoRequest = { prompt: string; orientation: VideoOrientation; resolution: VideoResolution } &
  ({ mode: 'text'; imageDataUris?: never } | { mode: 'image' | 'ingredients'; imageDataUris: string[] });
export type TransportDiagnostic = { phase: 'before_headers' | 'response_body' | 'complete'; payloadBytes: number; imageCount: number; imageBytes: number[]; mode?: 't2v' | 'sfv' | 'i2v'; headerMs?: number; httpStatus?: number };
export type RedirectDiagnostic = { reason: 'invalid_origin_config' | 'missing_location' | 'invalid_location' | 'credentials' | 'non_https' | 'custom_port' | 'unapproved_origin' | 'redirect_limit' | 'invalid_download_policy' | 'provider_path' | 'storage_origin_changed' | 'invalid_storage_path' | 'unsafe_address'; fromHost?: string; toHost?: string; hop?: number };
export class NexabotError extends Error {
  constructor(public readonly code: string, public readonly outcome: 'rejected' | 'unknown' | 'read' = 'read', public diagnostic?: { kind: 'timeout' | 'network' | 'http' | 'invalid_response'; httpStatus?: number; transport?: TransportDiagnostic; redirect?: RedirectDiagnostic }) {
    super(`NexaBot: ${code}`); this.name = 'NexabotError';
  }
}
function invalid(): never { throw new NexabotError('INVALID_INPUT', 'rejected'); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid response');
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) invalid();
  return value;
}
function amount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('invalid response');
  return value;
}
async function payload(input: VideoRequest) {
  if (!input || typeof input.prompt !== 'string' || validatePrompt(input.prompt) ||
    !['portrait', 'landscape'].includes(input.orientation) || !['720', '1080'].includes(input.resolution)) invalid();
  const body: { mode: string; prompt: string; ratio: number; resolution: number; media?: string[] } = {
    mode: input.mode === 'text' ? 't2v' : input.mode === 'image' ? 'sfv' : 'i2v', prompt: input.prompt.trim(),
    ratio: input.orientation === 'landscape' ? 1 : 2, resolution: Number(input.resolution),
  };
  if (input.mode === 'text') { if (input.imageDataUris !== undefined) invalid(); }
  else if (input.mode === 'image' || input.mode === 'ingredients') {
    if (!Array.isArray(input.imageDataUris) || input.imageDataUris.length < 1 || input.imageDataUris.length > (input.mode === 'image' ? 1 : VIDEO_INPUT.maxImages)) invalid();
    for (const uri of input.imageDataUris) {
    if (typeof uri !== 'string' || uri.length > Math.ceil(VIDEO_INPUT.maxImageBytes / 3) * 4 + 64) invalid();
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(uri);
    if (!match) invalid();
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.toString('base64') !== match[2] || await validateImageFile({ type: match[1], size: bytes.length,
      slice: (start, end) => new Blob([new Uint8Array(bytes.subarray(start, end))]) })) invalid();
    }
    body.media = input.imageDataUris;
  } else invalid();
  return body;
}

// No automatic retry: a lost POST response may still represent a charged job.
export function createNexabotClient(options: { apiKey?: string; fetcher?: typeof fetch; timeoutMs?: number; submitTimeoutMs?: number } = {}) {
  const DOWNLOAD_ORIGINS = downloadOrigins();
  const policy=process.env.NEXABOT_DOWNLOAD_POLICY??'exact';
  if(!['exact','provider-redirect'].includes(policy))throw new NexabotError('UNSAFE_DOWNLOAD_REDIRECT','read',{kind:'invalid_response',redirect:{reason:'invalid_download_policy'}});
  const key = options.apiKey ?? process.env.NEXABOT_API_KEY;
  if (!key || !/^nxb_[A-Za-z0-9_-]+$/.test(key)) throw new NexabotError('MISSING_OR_INVALID_KEY', 'rejected');
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? GENERATION_TIMEOUTS.providerReadMs;
  const submitTimeoutMs = options.submitTimeoutMs ?? options.timeoutMs ?? GENERATION_TIMEOUTS.providerSubmitMs;
  async function request<T>(path: string, method: 'GET' | 'POST', parse: (response: Response) => Promise<T>, body?: unknown, onDiagnostic?: (value: TransportDiagnostic) => void): Promise<T> {
    const serialized = body ? JSON.stringify(body) : undefined;
    const media = body && typeof body === 'object' && 'media' in body && Array.isArray(body.media) ? body.media : [];
    const mode = body && typeof body === 'object' && 'mode' in body ? body.mode : undefined;
    const transport: TransportDiagnostic = { phase: 'before_headers', payloadBytes: serialized ? Buffer.byteLength(serialized, 'utf8') : 0, imageCount: media.length, imageBytes: media.map(uri => typeof uri === 'string' ? Buffer.byteLength(uri.slice(uri.indexOf(',') + 1), 'base64') : 0), ...(['t2v','sfv','i2v'].includes(String(mode)) ? { mode: mode as TransportDiagnostic['mode'] } : {}) };
    const started = performance.now();
    const controller = new AbortController();
    let responseStatus: number | undefined;
    let received = false;
    const timer = setTimeout(() => controller.abort(), method === 'POST' ? submitTimeoutMs : timeoutMs);
    try {
      let currentUrl = BASE + path;
      let response = await fetcher(currentUrl, { method, cache: 'no-store', redirect: 'manual', signal: controller.signal,
        headers: { 'x-api-key': key!, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: serialized } : {}) });
      received = true; responseStatus = response.status;
      transport.phase = 'response_body'; transport.headerMs = Math.round(performance.now() - started); transport.httpStatus = response.status;
      // Only NexaBot receives the API key, including on download redirects.
      if (method === 'GET' && path.endsWith('/download')) {
        const unsafe = (reason: RedirectDiagnostic['reason'], hop: number, target?: URL): never => {
          // Keep only hostnames and a fixed reason. Never retain Location, path, query or userinfo.
          throw new NexabotError('UNSAFE_DOWNLOAD_REDIRECT', 'read', { kind: 'invalid_response', httpStatus: response.status,
            redirect: { reason, fromHost: new URL(currentUrl).hostname, ...(target?.hostname ? { toHost: target.hostname } : {}), hop } });
        };
        let storageOrigin:string|null=null;
        for (let hop = 0; response.status >= 300 && response.status < 400 && hop < 3; hop++) {
          const location = response.headers.get('location');
          await response.body?.cancel();
          if (!location) return unsafe('missing_location', hop + 1);
          let target: URL;
          try { target = new URL(location, currentUrl); } catch { return unsafe('invalid_location', hop + 1); }
          if (target.username || target.password) unsafe('credentials', hop + 1, target);
          if (target.protocol !== 'https:') unsafe('non_https', hop + 1, target);
          if (target.port) unsafe('custom_port', hop + 1, target);
          const isNexabot = target.origin === BASE;
          if(policy==='provider-redirect'){
            if(storageOrigin&&target.origin!==storageOrigin)unsafe('storage_origin_changed',hop+1,target);
            if(isNexabot){if(target.pathname!==path)unsafe('provider_path',hop+1,target);}
            else {
              if(!isStorageUrl(target))unsafe('invalid_storage_path',hop+1,target);
              if(!storageOrigin&&new URL(currentUrl).origin!==BASE)unsafe('unapproved_origin',hop+1,target);
              storageOrigin??=target.origin;
            }
          }else if(!isNexabot&&!DOWNLOAD_ORIGINS.has(target.origin))unsafe('unapproved_origin',hop+1,target);
          try{
            response = policy==='provider-redirect'&&!isNexabot&&!options.fetcher
              ? await pinnedStorageGet(target,controller.signal)
              : await fetcher(target.href,{method:'GET',cache:'no-store',redirect:'manual',signal:controller.signal,headers:isNexabot?{'x-api-key':key!}:undefined});
          }catch(error){if(error instanceof StoragePolicyError)unsafe(error.reason,hop+1,target);throw error;}
          currentUrl=target.href;
          responseStatus = response.status; transport.httpStatus = response.status;
        }
        if (response.status >= 300 && response.status < 400) {
          await response.body?.cancel();
          unsafe('redirect_limit', 3);
        }
      }
      if (!response.ok) {
        await response.body?.cancel();
        const rejected = [400, 401, 402, 403, 404, 429].includes(response.status);
        throw new NexabotError(`HTTP_${response.status}`, method === 'POST' ? (rejected ? 'rejected' : 'unknown') : 'read', { kind: 'http', httpStatus: response.status });
      }
      const result = await parse(response); transport.phase = 'complete'; return result;
    } catch (error) {
      const diagnostic = { kind: controller.signal.aborted ? 'timeout' as const : received ? 'invalid_response' as const : 'network' as const, ...(responseStatus ? { httpStatus: responseStatus } : {}) };
      if (error instanceof NexabotError) { error.diagnostic ??= diagnostic; error.diagnostic.transport = transport; throw error; }
      throw new NexabotError(controller.signal.aborted ? 'TIMEOUT' : 'INVALID_OR_UNAVAILABLE_RESPONSE', method === 'POST' ? 'unknown' : 'read', { ...diagnostic, transport });
    } finally { clearTimeout(timer); try { onDiagnostic?.(transport); } catch { /* Observability never changes request outcome. */ } }
  }
  async function json(response: Response) {
    const reader = response.body?.getReader(); if (!reader) throw new Error('empty');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) { const item = await reader.read(); if (item.done) break; size += item.value.length;
        if (size > 64 * 1024) throw new Error('oversize'); chunks.push(item.value); }
    } finally { await reader.cancel(); }
    const data = record(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (data.ok !== true) throw new Error('not ok'); return data;
  }
  return {
    async submitVideo(input: VideoRequest, onDiagnostic?: (value: TransportDiagnostic) => void) {
      const body = await payload(input);
      return request('/api/v1/api', 'POST', async response => {
        if (response.status !== 202) throw new Error('unexpected status');
        const data = await json(response);
        if (data.status !== 'queued' && data.status !== 'processing') throw new Error('unexpected status');
        const jobId = id(data.job_id);
        return { jobId, status: 'queued' as const, creditCost: amount(data.credit_cost), creditBalance: amount(data.credit_balance), estimatedSeconds: amount(data.est_seconds) };
      }, body, onDiagnostic).catch(error => {
        // A malformed accepted job ID is an unknown submission, never a safe rejection.
        if (error instanceof NexabotError && error.code === 'INVALID_INPUT') throw new NexabotError('INVALID_OR_UNAVAILABLE_RESPONSE', 'unknown', error.diagnostic);
        throw error;
      });
    },
    async getJob(jobId: string) {
      const safeId = id(jobId);
      return request(`/api/v1/jobs/${safeId}`, 'GET', async response => {
        const job = record((await json(response)).job);
        if (job.id !== safeId || !['queued', 'processing', 'done', 'failed'].includes(String(job.status)) || !['t2v', 'sfv', 'i2v'].includes(String(job.mode))) throw new Error('invalid job');
        return { jobId: safeId, status: job.status as JobStatus, mode: job.mode as 't2v' | 'sfv' | 'i2v' };
      });
    },
    async getCredit() {
      return request('/api/v1/api/credit', 'GET', async response => {
        const data = await json(response);
        if (data.registered !== true) throw new Error('unregistered');
        return { credit: amount(data.credit), creditCost: amount(data.credit_cost) };
      });
    },
    async downloadVideo(jobId: string) {
      return request(`/api/v1/jobs/${id(jobId)}/download`, 'GET', async response => {
        if (response.status !== 200 || !/^video\/mp4(?:;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) {
          await response.body?.cancel(); throw new Error('invalid video');
        }
        // Caller must consume/cancel the stream and apply its own size/time limits.
        return response;
      });
    },
  };
}
