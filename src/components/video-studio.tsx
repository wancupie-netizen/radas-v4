'use client';

import Image from 'next/image';
import { requestJson, RequestError, generationIssue } from '@/lib/errors/client';
import { GenerationResult } from './generation-result';
import { RecentHistory } from './recent-history';
import { pruneRecent, rememberRecent, type RecentDetails, type RecentVideo } from '@/lib/history/recent';
import { parseRequestedGeneration, type Generation } from '@/lib/generations/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PRODUCT } from '@/lib/config';
import type { CreditSnapshot } from '@/lib/credits/types';
import { VIDEO_INPUT, validateImageFile, validatePrompt, type VideoMode, type VideoOrientation, type VideoResolution } from '@/lib/video/input';

type SourceImage = { file: File; url: string; width: number; height: number };

export function VideoStudio({ credits, generationEnabled, onCreditsChanged }: { credits: CreditSnapshot; generationEnabled: boolean; onCreditsChanged: () => Promise<void> }) {
  const [history, setHistory] = useState<RecentVideo[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const details = useRef<RecentDetails | null>(null);
  const previewPanel = useRef<HTMLElement>(null);
  const rememberCompletion = useCallback((next: Generation) => {
    const snapshot = details.current;
    if (snapshot) setHistory(previous => rememberRecent(previous, next, snapshot, Date.now()));
  }, []);
  useEffect(() => {
    if (history.length === 0) return;
    let timer: ReturnType<typeof setTimeout>;
    const prune = () => setHistory(previous => pruneRecent(previous, Date.now()));
    function tick() { prune(); schedule(); }
    function schedule() {
      const remaining = Math.min(...history.map(item => Date.parse(item.generation.expiresAt))) - Date.now();
      timer = setTimeout(tick, Math.min(60_000, Math.max(100, remaining + 20)));
    }
    schedule();
    const visible = () => { if (document.visibilityState === 'visible') prune(); };
    document.addEventListener('visibilitychange', visible);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [history]);
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [flowError, setFlowError] = useState('');
  const [pollAttempt, setPollAttempt] = useState(0);
  const pending = useRef<{ id: string; form: FormData } | null>(null);
  const submittingNow = useRef(false);
  const locked = submitting || Boolean(pending.current) || Boolean(generation && !['done', 'failed', 'rejected'].includes(generation.status));
  const [mode, setMode] = useState<VideoMode>('text');
  const [orientation, setOrientation] = useState<VideoOrientation>('portrait');
  const [resolution, setResolution] = useState<VideoResolution>('720');
  const [prompts, setPrompts] = useState({ text: '', image: '' });
  const [touched, setTouched] = useState({ text: false, image: false });
  const [image, setImage] = useState<SourceImage | null>(null);
  const [imageError, setImageError] = useState('');
  const [readingImage, setReadingImage] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const selection = useRef(0);
  const prompt = prompts[mode];
  const promptError = touched[mode] ? validatePrompt(prompt) : null;
  const selectedHistory = history.find(item => item.id === selectedHistoryId);
  const previewGeneration = selectedHistory?.generation ?? generation;
  const previewDetails = selectedHistory ?? (generation ? details.current : null);
  const ratio = (previewDetails?.orientation ?? orientation) === 'portrait' ? '9:16' : '16:9';
  const previewResolution = previewDetails?.resolution ?? resolution;
  function selectHistory(id: string) {
    const item = history.find(video => video.id === id);
    if (!item || Date.parse(item.generation.expiresAt) <= Date.now()) { setHistory(previous => pruneRecent(previous, Date.now())); return; }
    setSelectedHistoryId(id); previewPanel.current?.scrollIntoView({ block: 'nearest' });
  }

  useEffect(() => () => { selection.current += 1; }, []);
  const refreshCredits = useRef(onCreditsChanged);
  useEffect(() => { refreshCredits.current = onCreditsChanged; }, [onCreditsChanged]);
  useEffect(() => {
    if (!generation || !['reserved', 'submitting', 'queued', 'processing'].includes(generation.status)) return;
    let alive = true; let timer: ReturnType<typeof setTimeout>; let failures = 0;
    const controller = new AbortController(); const started = Date.now();
    async function poll() {
      if (!alive) return;
      try {
        const data = await requestJson(`/api/generations/${generation!.id}`, { signal: controller.signal });
        const next = parseRequestedGeneration(data, generation!.id);
        if (!alive) return;
        setGeneration(next); rememberCompletion(next);
        if (data.pollUnavailable) throw new Error('provider_poll_failed');
        failures = 0; setFlowError('');
        if (['done', 'failed', 'rejected', 'unknown'].includes(next.status)) { void refreshCredits.current(); return; }
      } catch (error) { if (!alive) return; if (error instanceof RequestError && error.status === 401) { window.location.assign('/login'); return; } failures += 1; }
      if (failures >= 3 || Date.now() - started > 15 * 60 * 1000) {
        setFlowError('Status belum dapat disemak. Cuba semak status semula; jangan submit video baharu.'); return;
      }
      timer = setTimeout(poll, 4000);
    }
    timer = setTimeout(poll, 1000);
    return () => { alive = false; clearTimeout(timer); controller.abort(); };
  }, [generation?.id, generation?.status, pollAttempt, rememberCompletion]);

  async function generate() {
    if (submittingNow.current || !generationEnabled || (generation && !['done', 'failed', 'rejected'].includes(generation.status))) return;
    if (!pending.current) {
      setTouched(previous => ({ ...previous, [mode]: true }));
      if (validatePrompt(prompt) || readingImage || (mode === 'image' && !image)) return;
      if (credits.status !== 'ready' || credits.balance < 1) return;
      const form = new FormData(); const id = crypto.randomUUID();
      form.set('requestId', id); form.set('mode', mode); form.set('prompt', prompt);
      form.set('orientation', orientation); form.set('resolution', resolution);
      if (mode === 'image' && image) form.set('image', image.file);
      pending.current = { id, form };
    }
    submittingNow.current = true; setSubmitting(true); setFlowError(''); setGeneration(null); setSelectedHistoryId(null);
    try {
      const data = await requestJson('/api/generations', { method: 'POST', body: pending.current.form }, 45_000);
      const next = parseRequestedGeneration(data, pending.current.id);
      const form = pending.current.form;
      details.current = { id: next.id, prompt: String(form.get('prompt')).trim(), mode: form.get('mode') as VideoMode,
        orientation: form.get('orientation') as VideoOrientation, resolution: form.get('resolution') as VideoResolution };
      setGeneration(next); rememberCompletion(next); pending.current = null;
      await refreshCredits.current();
    } catch (error) {
      if (error instanceof RequestError && error.status === 401) { window.location.assign('/login'); return; }
      const issue = generationIssue(error);
      if (!issue.retainRequest) pending.current = null;
      setFlowError(issue.message);
    }
    finally { submittingNow.current = false; setSubmitting(false); }
  }

  function again() { setSelectedHistoryId(null); details.current = null; setGeneration(null); pending.current = null; setFlowError(''); }

  useEffect(() => {
    if (!image) return;
    const url = image.url;
    return () => URL.revokeObjectURL(url);
  }, [image]);

  function removeImage() {
    selection.current += 1;
    setImage(null);
    setImageError('');
    setReadingImage(false);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function chooseImage(files: File[]) {
    if (locked || files.length === 0) return;
    removeImage();
    if (files.length !== 1) { setImageError('Pilih satu gambar sahaja.'); return; }
    const current = ++selection.current;
    const file = files[0];
    let url: string | undefined;
    setReadingImage(true);
    try {
      const error = await validateImageFile(file);
      if (current !== selection.current) return;
      if (error) { setImageError(error); return; }
      url = URL.createObjectURL(file);
      const decoder = new window.Image();
      decoder.src = url;
      await decoder.decode();
      if (current !== selection.current) { URL.revokeObjectURL(url); return; }
      if (!decoder.naturalWidth || !decoder.naturalHeight) throw new Error('invalid_image');
      setImage({ file, url, width: decoder.naturalWidth, height: decoder.naturalHeight });
    } catch {
      if (url) URL.revokeObjectURL(url);
      if (current === selection.current) setImageError('Gambar tidak dapat dibaca. Pilih gambar lain.');
    } finally {
      if (current === selection.current) setReadingImage(false);
    }
  }

  return <><div className="studio-grid">
    <section className="generator panel" aria-label="Video settings">
      <div className="panel-heading"><span className="step">01</span><h2>Video settings</h2></div>
      <form noValidate onSubmit={event => { event.preventDefault(); void generate(); }}>
        <fieldset className="generation-settings" disabled={locked}>
        <label htmlFor="mode">Generation mode</label>
        <select id="mode" value={mode} onChange={event => setMode(event.target.value as VideoMode)}>
          <option value="text">Text to Video</option><option value="image">Image to Video</option>
        </select>

        {mode === 'image' && <div className={`source-upload${dragging ? ' dragging' : ''}`}
          onDragOver={event => { event.preventDefault(); if (!locked) setDragging(true); }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
          onDrop={event => { event.preventDefault(); setDragging(false); void chooseImage(Array.from(event.dataTransfer.files)); }}>
          <span className="upload-label">Source image</span>
          <input ref={fileInput} id="image" type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={event => {
            const files = Array.from(event.currentTarget.files || []);
            event.currentTarget.value = '';
            void chooseImage(files);
          }} />
          {image ? <div className="source-selected">
            <div className="source-thumbnail"><Image src={image.url} alt="Gambar sumber yang dipilih" fill unoptimized sizes="96px" /></div>
            <div className="source-info"><strong>{image.file.name}</strong><span>{image.width} × {image.height} · {(image.file.size / 1024 / 1024).toFixed(2)} MB</span></div>
          </div> : <p className="upload-instruction">{readingImage ? 'Menyemak gambar…' : 'Pilih atau seret gambar ke sini.'}</p>}
          <div className="image-actions"><button type="button" className="secondary" onClick={() => fileInput.current?.click()}>{image ? 'Tukar gambar' : 'Pilih gambar'}</button>
            {(image || readingImage) && <button type="button" className="text-button" onClick={removeImage}>{readingImage ? 'Batal' : 'Buang gambar'}</button>}
          </div>
          <p className="input-help">JPG, PNG, WEBP · Maksimum 10 MB</p>
          {imageError && <p className="input-error" role="alert">{imageError}</p>}
          <span className="sr-only" role="status">{image ? 'Gambar siap dipreview.' : readingImage ? 'Menyemak gambar.' : ''}</span>
        </div>}

        <fieldset><legend>Orientation</legend><div className="choices">
          <button type="button" aria-pressed={orientation === 'portrait'} className={orientation === 'portrait' ? 'selected' : ''} onClick={() => setOrientation('portrait')}><span className="ratio portrait" aria-hidden="true" />Portrait <span className="muted">9:16</span></button>
          <button type="button" aria-pressed={orientation === 'landscape'} className={orientation === 'landscape' ? 'selected' : ''} onClick={() => setOrientation('landscape')}><span className="ratio landscape" aria-hidden="true" />Landscape <span className="muted">16:9</span></button>
        </div></fieldset>
        <fieldset><legend>Resolution</legend><div className="choices">
          <button type="button" aria-pressed={resolution === '720'} className={resolution === '720' ? 'selected' : ''} onClick={() => setResolution('720')}>720p <span className="muted">HD</span></button>
          <button type="button" aria-pressed={resolution === '1080'} className={resolution === '1080' ? 'selected' : ''} onClick={() => setResolution('1080')}>1080p <span className="muted">Full HD</span></button>
        </div></fieldset>
        <div className="duration-setting"><span>Duration</span><strong>{PRODUCT.durationSeconds} seconds <span className="muted">Fixed</span></strong></div>
        <div className="prompt-label"><label htmlFor="prompt">{mode === 'image' ? 'Motion prompt' : 'Describe your video'}</label><span id="prompt-count" className="muted">{prompt.length}/{VIDEO_INPUT.maxPromptLength}</span></div>
        <textarea id="prompt" maxLength={VIDEO_INPUT.maxPromptLength} value={prompt} aria-invalid={Boolean(promptError)} aria-describedby={`prompt-count prompt-help${promptError ? ' prompt-error' : ''}`}
          onChange={event => setPrompts(previous => ({ ...previous, [mode]: event.target.value }))}
          onBlur={() => setTouched(previous => ({ ...previous, [mode]: true }))}
          placeholder={mode === 'image' ? 'Contoh: Subjek tersenyum sambil kamera bergerak perlahan ke hadapan…' : 'Contoh: Seorang creator memperkenalkan produk di studio dengan cahaya lembut…'} />
        <p id="prompt-help" className="input-help">{mode === 'image' ? 'Terangkan gerakan subjek dan kamera.' : 'Terangkan subjek, suasana dan gerakan kamera.'}</p>
        {promptError && <p id="prompt-error" className="input-error" role="alert">{promptError}</p>}
        </fieldset>
        <button className="primary generate" type="submit" disabled={!generationEnabled || submitting || Boolean(generation && !['done', 'failed', 'rejected'].includes(generation.status)) || (!pending.current && (credits.status !== 'ready' || credits.balance < 1 || Boolean(validatePrompt(prompt)) || readingImage || (mode === 'image' && !image)))} aria-describedby="generation-note">{submitting ? 'Preparing…' : pending.current ? 'Semak request semula' : 'Generate Video'} <span>· {PRODUCT.creditsPerGeneration} Credit</span></button>
        <p id="generation-note" className="phase-note">{generationEnabled ? '1 credit digunakan untuk setiap generation. Download terus apabila siap.' : 'Generation belum diaktifkan. Tiada credit digunakan.'}</p>
        {flowError && <div className="input-error" role="alert">{flowError}{pending.current && <p>Rujukan request: <code>{pending.current.id}</code></p>}{generation && <button type="button" className="secondary" onClick={() => { setFlowError(''); setPollAttempt(previous => previous + 1); }}>Semak status semula</button>}</div>}
        {credits.status === 'unavailable' ? <p className="phase-note">Baki belum tersedia. Cuba semak semula di Credits.</p> : credits.balance === 0 ? <p className="phase-note">Baki anda 0 credit.</p> : null}
      </form>
    </section>

    <section ref={previewPanel} className="preview panel" aria-label="Video preview">
      <div className="panel-heading"><span className="step">02</span><h2>Preview</h2><span className="preview-meta">{ratio} · {previewResolution}p</span></div>
      <div className="preview-stage">
        {previewGeneration ? <GenerationResult key={previewGeneration.id} generation={previewGeneration} onAgain={selectedHistory ? () => setSelectedHistoryId(null) : again} againLabel={selectedHistory ? 'Tutup preview history' : 'Generate Again'} /> : mode === 'image' && image ? <>
          <div className={`source-preview ${orientation}`}><Image src={image.url} alt="Preview gambar sumber" fill unoptimized sizes="(max-width: 820px) 85vw, 440px" /></div>
          <h3>Source image preview</h3><p>Gambar sumber untuk Image to Video.</p>
        </> : <>
          <div className={`empty-frame ${orientation}`}><span className="play-icon" aria-hidden="true">▷</span></div>
          <h3>{mode === 'image' ? <>Choose your<br />source image</> : <>Your generated video<br />will appear here</>}</h3>
          <p>{mode === 'image' ? 'Pilih gambar untuk lihat preview di sini.' : 'Preview hasil video sebelum download.'}</p>
        </>}
        <div className="video-specs" aria-label="Selected video settings"><span>{ratio}</span><span>{previewResolution}p</span><span>{PRODUCT.durationSeconds} saat</span><span>{PRODUCT.creditsPerGeneration} credit</span></div>
      </div>
      <div className="preview-footer"><span aria-hidden="true">↓</span><p>Download terus selepas generate.<br /><span>Video hilang daripada paparan apabila refresh atau logout.</span></p></div>
    </section>
  </div><RecentHistory items={history} selectedId={selectedHistory?.id ?? null} onSelect={selectHistory} /></>;
}
