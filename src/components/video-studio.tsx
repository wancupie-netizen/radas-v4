'use client';
import { GENERATION_TIMEOUTS } from '@/lib/generations/timeouts';

import Image from 'next/image';
import './ingredients.css';
import { requestJson, RequestError, generationIssue } from '@/lib/errors/client';
import { GenerationResult } from './generation-result';
import { RecentHistory } from './recent-history';
import { pruneRecent, rememberRecent, type RecentDetails, type RecentVideo } from '@/lib/history/recent';
import { recoverGeneration } from '@/lib/generations/recovery';
import { canGenerateAgain, parseRequestedGeneration, type Generation } from '@/lib/generations/types';
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
  const pending = useRef<{ id: string; form: FormData; attempted: boolean } | null>(null);
  const submittingNow = useRef(false);
  const locked = submitting || Boolean(pending.current) || Boolean(generation && !canGenerateAgain(generation));
  const [mode, setMode] = useState<VideoMode>('text');
  const [orientation, setOrientation] = useState<VideoOrientation>('portrait');
  const [resolution, setResolution] = useState<VideoResolution>('720');
  const [prompts, setPrompts] = useState({ text: '', image: '', ingredients: '' });
  const [touched, setTouched] = useState({ text: false, image: false, ingredients: false });
  const [sourceImages, setSourceImages] = useState<Record<'image' | 'ingredients', SourceImage[]>>({ image: [], ingredients: [] });
  const imagesRef = useRef(sourceImages);
  const images = mode === 'text' ? [] : sourceImages[mode];
  const imageLimit = mode === 'image' ? 1 : VIDEO_INPUT.maxImages;
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
    if (!generation || canGenerateAgain(generation)) return;
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
        if (canGenerateAgain(next)) { void refreshCredits.current(); return; }
      } catch (error) { if (!alive) return; if (error instanceof RequestError && error.status === 401) { window.location.assign('/login'); return; } failures += 1; }
      if (failures >= 3 || Date.now() - started > 15 * 60 * 1000) {
        setFlowError('Status belum dapat disemak. Cuba semak status semula; jangan submit video baharu.'); return;
      }
      timer = setTimeout(poll, 4000);
    }
    timer = setTimeout(poll, 1000);
    return () => { alive = false; clearTimeout(timer); controller.abort(); };
  }, [generation?.id, generation?.status, generation?.releasedAt, pollAttempt, rememberCompletion]);

  async function generate() {
    if (submittingNow.current || !generationEnabled || (generation && !canGenerateAgain(generation))) return;
    if (!pending.current) {
      setTouched(previous => ({ ...previous, [mode]: true }));
      if (validatePrompt(prompt) || readingImage || (mode !== 'text' && images.length === 0)) return;
      if (credits.status !== 'ready' || credits.balance < 1) return;
      const form = new FormData(); const id = crypto.randomUUID();
      form.set('requestId', id); form.set('mode', mode); form.set('prompt', prompt);
      form.set('orientation', orientation); form.set('resolution', resolution);
      if (mode !== 'text') for (const image of images) form.append('image', image.file);
      pending.current = { id, form, attempted: false };
    }
    submittingNow.current = true; setSubmitting(true); setFlowError(''); setGeneration(null); setSelectedHistoryId(null);
    try {
      const current = pending.current;
      const recovering = current.attempted;
      current.attempted = true;
      const data = recovering ? await recoverGeneration(current.id, current.form)
        : await requestJson('/api/generations', { method: 'POST', body: current.form }, GENERATION_TIMEOUTS.browserSubmitMs);
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

  useEffect(() => () => { for (const image of [...imagesRef.current.image, ...imagesRef.current.ingredients]) URL.revokeObjectURL(image.url); }, []);

  function updateImages(next: SourceImage[]) {
    if (mode === 'text') return;
    imagesRef.current = { ...imagesRef.current, [mode]: next };
    setSourceImages(imagesRef.current);
  }

  function removeImage(index: number) {
    if (locked || readingImage || mode === 'text') return;
    URL.revokeObjectURL(imagesRef.current[mode][index].url);
    updateImages(imagesRef.current[mode].filter((_, position) => position !== index));
    setImageError('');
  }

  async function chooseImage(files: File[]) {
    if (locked || readingImage || mode === 'text' || files.length === 0) return;
    if (imagesRef.current[mode].length + files.length > imageLimit) { setImageError(`Maksimum ${imageLimit} img. Buang img dahulu untuk menggantikannya.`); return; }
    const current = ++selection.current;
    const added: SourceImage[] = [];
    let pendingUrl: string | undefined;
    setReadingImage(true); setImageError('');
    try {
      for (const file of files) {
        const error = await validateImageFile(file);
        if (error) throw new Error(error);
        pendingUrl = URL.createObjectURL(file);
        const decoder = new window.Image(); decoder.src = pendingUrl;
        await decoder.decode();
        if (!decoder.naturalWidth || !decoder.naturalHeight || decoder.naturalWidth * decoder.naturalHeight > 40_000_000) throw new Error('Img tidak dapat dibaca atau terlalu besar dimensinya.');
        added.push({ file, url: pendingUrl, width: decoder.naturalWidth, height: decoder.naturalHeight });
        pendingUrl = undefined;
      }
      if (current !== selection.current) { for (const image of added) URL.revokeObjectURL(image.url); return; }
      updateImages([...imagesRef.current[mode], ...added]);
    } catch (error) {
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      for (const image of added) URL.revokeObjectURL(image.url);
      if (current === selection.current) setImageError(error instanceof Error && (error.message.startsWith('Pilih') || error.message.startsWith('Saiz')) ? error.message : 'Img tidak dapat dibaca. Pilih img JPG, PNG atau WEBP yang sah, maksimum 10 MB.');
    } finally { if (current === selection.current) setReadingImage(false); }
  }

  return <><div className="studio-grid">
    <section className="generator panel" aria-label="Video settings">
      <div className="panel-heading"><span className="step">01</span><h2>Video settings</h2></div>
      <form noValidate onSubmit={event => { event.preventDefault(); void generate(); }}>
        <fieldset className="generation-settings" disabled={locked}>
        <label htmlFor="mode">Generation mode</label>
        <select id="mode" value={mode} onChange={event => { selection.current += 1; setReadingImage(false); setImageError(''); setMode(event.target.value as VideoMode); }}>
          <option value="text">Text to Video</option><option value="image">Image to Video · 1 img</option><option value="ingredients">Ingredients to Video · 1–3 img</option>
        </select>

        {mode !== 'text' && <div className={`source-upload${dragging ? ' dragging' : ''}`}
          onDragOver={event => { event.preventDefault(); if (!locked) setDragging(true); }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
          onDrop={event => { event.preventDefault(); setDragging(false); void chooseImage(Array.from(event.dataTransfer.files)); }}>
          <span className="upload-label">Reference img · {images.length}/{imageLimit}</span>
          <input ref={fileInput} id="image" type="file" multiple={mode === 'ingredients'} disabled={readingImage} hidden accept="image/jpeg,image/png,image/webp" onChange={event => {
            const files = Array.from(event.currentTarget.files || []);
            event.currentTarget.value = '';
            void chooseImage(files);
          }} />
          <div className="ingredients-list">{images.map((image, index) => <div className="source-selected" key={image.url}>
            <div className="source-thumbnail"><Image src={image.url} alt={`Img rujukan ${index + 1}`} fill unoptimized sizes="96px" /></div>
            <div className="source-info"><strong>{index + 1}. {image.file.name}</strong><span>{image.width} × {image.height} · {(image.file.size / 1024 / 1024).toFixed(2)} MB</span>
              <button type="button" className="text-button" disabled={readingImage} aria-label={`Buang img ${index + 1}: ${image.file.name}`} onClick={() => removeImage(index)}>Buang img</button></div>
          </div>)}</div>
          {images.length === 0 && <p className="upload-instruction">{mode === 'image' ? 'Pilih atau seret 1 img ke sini.' : 'Pilih atau seret 1–3 img ke sini.'}</p>}
          <div className="image-actions"><button type="button" className="secondary" disabled={readingImage || images.length >= imageLimit} onClick={() => fileInput.current?.click()}>{images.length ? 'Tambah img' : 'Pilih img'}</button></div>
          <p className="input-help">JPG, PNG, WEBP · 10 MB setiap img{mode === 'ingredients' ? ' · Jumlah maksimum 30 MB' : ''}</p>
          {imageError && <p className="input-error" role="alert">{imageError}</p>}
          <span className="sr-only" role="status">{readingImage ? 'Menyemak img…' : `${images.length} img dipilih.`}</span>
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
        <div className="prompt-label"><label htmlFor="prompt">{mode === 'image' ? 'Motion prompt' : mode === 'ingredients' ? 'Describe your ingredients video' : 'Describe your video'}</label><span id="prompt-count" className="muted">{prompt.length}/{VIDEO_INPUT.maxPromptLength}</span></div>
        <textarea id="prompt" maxLength={VIDEO_INPUT.maxPromptLength} value={prompt} aria-invalid={Boolean(promptError)} aria-describedby={`prompt-count prompt-help${promptError ? ' prompt-error' : ''}`}
          onChange={event => setPrompts(previous => ({ ...previous, [mode]: event.target.value }))}
          onBlur={() => setTouched(previous => ({ ...previous, [mode]: true }))}
          placeholder={mode === 'image' ? 'Contoh: Subjek tersenyum sambil kamera bergerak perlahan ke hadapan…' : mode === 'ingredients' ? 'Contoh: Gunakan wanita dalam img 1 untuk memperkenalkan produk dalam img 2…' : 'Contoh: Seorang creator memperkenalkan produk di studio dengan cahaya lembut…'} />
        <p id="prompt-help" className="input-help">{mode === 'image' ? 'Terangkan gerakan subjek dan kamera.' : mode === 'ingredients' ? 'Nyatakan peranan setiap img, suasana dan gerakan yang anda mahu.' : 'Terangkan subjek, suasana dan gerakan kamera.'}</p>
        {promptError && <p id="prompt-error" className="input-error" role="alert">{promptError}</p>}
        </fieldset>
        <button className="primary generate" type="submit" disabled={!generationEnabled || submitting || Boolean(generation && !canGenerateAgain(generation)) || (!pending.current && (credits.status !== 'ready' || credits.balance < 1 || Boolean(validatePrompt(prompt)) || readingImage || (mode !== 'text' && images.length === 0)))} aria-describedby="generation-note">{submitting ? 'Preparing…' : pending.current ? 'Semak request semula' : 'Generate Video'} <span>· {PRODUCT.creditsPerGeneration} Credit</span></button>
        <p id="generation-note" className="phase-note">{generationEnabled ? '1 credit digunakan untuk setiap generation. Download terus apabila siap.' : 'Generation belum diaktifkan. Tiada credit digunakan.'}</p>
        {flowError && <div className="input-error" role="alert">{flowError}{pending.current && <p>Rujukan request: <code>{pending.current.id}</code></p>}{generation && <button type="button" className="secondary" onClick={() => { setFlowError(''); setPollAttempt(previous => previous + 1); }}>Semak status semula</button>}</div>}
        {credits.status === 'unavailable' ? <p className="phase-note">Baki belum tersedia. Cuba semak semula di Credits.</p> : credits.balance === 0 ? <p className="phase-note">Baki anda 0 credit.</p> : null}
      </form>
    </section>

    <section ref={previewPanel} className="preview panel" aria-label="Video preview">
      <div className="panel-heading"><span className="step">02</span><h2>Preview</h2><span className="preview-meta">{ratio} · {previewResolution}p</span></div>
      <div className="preview-stage">
        {previewGeneration ? <GenerationResult key={previewGeneration.id} generation={previewGeneration} onAgain={selectedHistory ? () => setSelectedHistoryId(null) : again} againLabel={selectedHistory ? 'Tutup preview history' : 'Generate Again'} /> : mode !== 'text' && images.length > 0 ? <>
          <div className={mode === 'image' ? `source-preview ${orientation}` : 'ingredients-preview'}>{mode === 'image' ? <Image src={images[0].url} alt="Preview img sumber" fill unoptimized sizes="(max-width: 820px) 85vw, 440px" /> : images.map((image, index) => <figure key={image.url}><div className="ingredient-preview-image"><Image src={image.url} alt={`Preview img rujukan ${index + 1}`} fill unoptimized sizes="(max-width: 820px) 28vw, 150px" /></div><figcaption>Img {index + 1}</figcaption></figure>)}</div>
          <h3>{mode === 'image' ? 'Image preview' : 'Ingredients preview'}</h3><p>{images.length} img rujukan untuk video anda.</p>
        </> : <>
          <div className={`empty-frame ${orientation}`}><span className="play-icon" aria-hidden="true">▷</span></div>
          <h3>{mode !== 'text' ? <>Choose your<br />reference img</> : <>Your generated video<br />will appear here</>}</h3>
          <p>{mode !== 'text' ? `Pilih ${mode === 'image' ? '1' : '1–3'} img untuk lihat preview di sini.` : 'Preview hasil video sebelum download.'}</p>
        </>}
        <div className="video-specs" aria-label="Selected video settings"><span>{ratio}</span><span>{previewResolution}p</span><span>{PRODUCT.durationSeconds} saat</span><span>{PRODUCT.creditsPerGeneration} credit</span></div>
      </div>
      <div className="preview-footer"><span aria-hidden="true">↓</span><p>Download terus selepas generate.<br /><span>Video hilang daripada paparan apabila refresh atau logout.</span></p></div>
    </section>
  </div><RecentHistory items={history} selectedId={selectedHistory?.id ?? null} onSelect={selectHistory} /></>;
}
