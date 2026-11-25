'use client';
import { GENERATION_TIMEOUTS } from '@/lib/generations/timeouts';

import Image from 'next/image';
import './ingredients.css';
import { requestJson, RequestError, generationIssue } from '@/lib/errors/client';
import { GenerationResult } from './generation-result';
import {GenerationTimer} from './generation-timer';
import {parseTiming,type GenerationClock} from '@/lib/generations/timing';
import { RecentHistory } from './recent-history';
import { pruneRecent, rememberRecent, type RecentDetails, type RecentVideo } from '@/lib/history/recent';
import { emptyAttemptSummary, observeAttempt } from '@/lib/generations/guidance';
import { recoverGeneration } from '@/lib/generations/recovery';
import { canGenerateAgain, shouldPollGeneration, parseRequestedGeneration, type Generation } from '@/lib/generations/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PRODUCT } from '@/lib/config';
import type { CreditSnapshot } from '@/lib/credits/types';
import { VIDEO_INPUT, validateImageFile, validatePrompt, type VideoMode, type VideoOrientation, type VideoResolution } from '@/lib/video/input';

type SourceImage = { file: File; url: string; width: number; height: number };
const STUDIO_DURATION_SECONDS = 15;

export function VideoStudio({ credits, generationEnabled, onCreditsChanged }: { credits: CreditSnapshot; generationEnabled: boolean; onCreditsChanged: () => Promise<void> }) {
  const [history, setHistory] = useState<RecentVideo[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    let restoring = false;
    const restore = async () => {
      if (restoring || controller.signal.aborted) return;
      restoring = true;
      try {
        const response = await fetch('/api/generations', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json();
        if (!controller.signal.aborted && Array.isArray(data.items)) setHistory(previous => {
          const ids = new Set(data.items.map((item: RecentVideo) => item.id));
          return pruneRecent([...data.items, ...previous.filter(item => !ids.has(item.id))], Date.now()).slice(0, 20);
        });
      } catch { /* Existing session history remains available during an outage. */ }
      finally { restoring = false; }
    };
    void restore();
    window.addEventListener('focus', restore);
    const timer = setInterval(restore, 10_000);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener('focus', restore); };
  }, []);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const details = useRef<RecentDetails | null>(null);
  const [attemptSummary, setAttemptSummary] = useState(emptyAttemptSummary);
  const previewPanel = useRef<HTMLElement>(null);
  const rememberCompletion = useCallback((next: Generation) => {
    setAttemptSummary(previous => observeAttempt(previous, next));
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
  const [restorePhase,setRestorePhase]=useState<'loading'|'ready'|'error'>('loading');
  const [restoreAttempt,setRestoreAttempt]=useState(0);
  const [initialClock,setInitialClock]=useState<GenerationClock|undefined>(undefined);
  const [requestClock,setRequestClock]=useState<{id:string;started:number}|null>(null);
  const currentGeneration=useRef(generation);currentGeneration.current=generation;
  const [submitting, setSubmitting] = useState(false);
  const [flowError, setFlowError] = useState('');
  const [pollAttempt, setPollAttempt] = useState(0);
  const pending = useRef<{ id: string; form: FormData; attempted: boolean } | null>(null);
  const submittingNow = useRef(false);
  const locked = restorePhase!=='ready' || submitting || Boolean(pending.current) || Boolean(generation && !canGenerateAgain(generation));
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

  useEffect(()=>{
    if(!generationEnabled){setRestorePhase('ready');return;}
    const controller=new AbortController();let alive=true;setRestorePhase('loading');
    void(async()=>{try{
      const item=parseTiming(await requestJson('/api/generations/timing',{signal:controller.signal}));
      if(!alive)return;
      if(item&&!submittingNow.current&&!pending.current&&!currentGeneration.current){
        details.current={id:item.id,prompt:item.prompt,mode:item.mode,orientation:item.orientation,resolution:item.resolution};
        setMode(item.mode);setOrientation(item.orientation);setResolution(item.resolution);setPrompts(previous=>({...previous,[item.mode]:item.prompt}));
        setInitialClock(item.clock);setGeneration(item.generation);
      }
      setRestorePhase('ready');
    }catch(error){if(!alive)return;if(error instanceof RequestError&&error.status===401){window.location.assign('/login');return;}setRestorePhase('error');}})();
    return()=>{alive=false;controller.abort();};
  },[generationEnabled,restoreAttempt]);

  useEffect(() => () => { selection.current += 1; }, []);
  const refreshCredits = useRef(onCreditsChanged);
  useEffect(() => { refreshCredits.current = onCreditsChanged; }, [onCreditsChanged]);
  useEffect(() => {
    if (!generation || !shouldPollGeneration(generation)) return;
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
        if (!shouldPollGeneration(next)) { void refreshCredits.current(); return; }
      } catch (error) { if (!alive) return; if (error instanceof RequestError && error.status === 401) { window.location.assign('/login'); return; } failures += 1; }
      if (failures >= 3 || Date.now() - started > 15 * 60 * 1000) {
        setFlowError("The status could not be checked. Check it again; do not submit a new video request."); return;
      }
      timer = setTimeout(poll, 4000);
    }
    timer = setTimeout(poll, 1000);
    return () => { alive = false; clearTimeout(timer); controller.abort(); };
  }, [generation?.id, generation?.status, generation?.releasedAt, generation?.videoState, pollAttempt, rememberCompletion]);

  useEffect(() => {
    if (!generation || !shouldPollGeneration(generation)) return;
    const resume = () => {
      if (document.visibilityState === 'visible') setPollAttempt(previous => previous + 1);
    };
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => { window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume); };
  }, [generation?.id, generation?.status, generation?.releasedAt]);

  async function generate() {
    if (restorePhase!=='ready' || submittingNow.current || !generationEnabled || (generation && !canGenerateAgain(generation))) return;
    if (!pending.current) {
      setTouched(previous => ({ ...previous, [mode]: true }));
      if (validatePrompt(prompt) || readingImage || (mode !== 'text' && images.length === 0)) return;
      if (credits.status !== 'ready' || credits.balance < 1) return;
      const form = new FormData(); const id = crypto.randomUUID();
      form.set('requestId', id); form.set('mode', mode); form.set('prompt', prompt);
      form.set('orientation', orientation); form.set('resolution', resolution);
      if (mode !== 'text') for (const image of images) form.append('image', image.file);
      pending.current = { id, form, attempted: false };
      setRequestClock({id,started:performance.now()});setInitialClock(undefined);
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

  function again() { setRequestClock(null);setInitialClock(undefined);setSelectedHistoryId(null); details.current = null; setGeneration(null); pending.current = null; setFlowError(''); }

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
    if (imagesRef.current[mode].length + files.length > imageLimit) { setImageError(`Maximum ${imageLimit} images. Remove an image first to replace it.`); return; }
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
        if (!decoder.naturalWidth || !decoder.naturalHeight || decoder.naturalWidth * decoder.naturalHeight > 40_000_000) throw new Error("The image could not be read or its dimensions are too large.");
        added.push({ file, url: pendingUrl, width: decoder.naturalWidth, height: decoder.naturalHeight });
        pendingUrl = undefined;
      }
      if (current !== selection.current) { for (const image of added) URL.revokeObjectURL(image.url); return; }
      updateImages([...imagesRef.current[mode], ...added]);
    } catch (error) {
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      for (const image of added) URL.revokeObjectURL(image.url);
      if (current === selection.current) setImageError(error instanceof Error && (error.message.startsWith("Choose") || error.message.startsWith('The maximum image size')) ? error.message : "The image could not be read. Choose a valid JPG, PNG or WEBP image no larger than 10 MB.");
    } finally { if (current === selection.current) setReadingImage(false); }
  }

  return <><div className="studio-grid">
    <section className="generator panel" aria-label="Video settings">
      <div className="panel-heading"><span className="step">01</span><h2>Video settings</h2></div>
      <form noValidate onSubmit={event => { event.preventDefault(); void generate(); }}>
        <fieldset className="generation-settings" disabled={locked}>
        <label htmlFor="mode">Generation mode</label>
        <select id="mode" value={mode} onChange={event => { selection.current += 1; setReadingImage(false); setImageError(''); setMode(event.target.value as VideoMode); }}>
          <option value="text">Text to Video</option><option value="image">Image to Video · 1 image</option><option value="ingredients">Ingredients to Video · 1–3 images</option>
        </select>

        {mode !== 'text' && <div className={`source-upload${dragging ? ' dragging' : ''}`}
          onDragOver={event => { event.preventDefault(); if (!locked) setDragging(true); }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
          onDrop={event => { event.preventDefault(); setDragging(false); void chooseImage(Array.from(event.dataTransfer.files)); }}>
          <span className="upload-label">Reference images · {images.length}/{imageLimit}</span>
          <input ref={fileInput} id="image" type="file" multiple={mode === 'ingredients'} disabled={readingImage} hidden accept="image/jpeg,image/png,image/webp" onChange={event => {
            const files = Array.from(event.currentTarget.files || []);
            event.currentTarget.value = '';
            void chooseImage(files);
          }} />
          <div className="ingredients-list">{images.map((image, index) => <div className="source-selected" key={image.url}>
            <div className="source-thumbnail"><Image src={image.url} alt={`Reference image ${index + 1}`} fill unoptimized sizes="96px" /></div>
            <div className="source-info"><strong>{index + 1}. {image.file.name}</strong><span>{image.width} × {image.height} · {(image.file.size / 1024 / 1024).toFixed(2)} MB</span>
              <button type="button" className="text-button" disabled={readingImage} aria-label={`Remove image ${index + 1}: ${image.file.name}`} onClick={() => removeImage(index)}>Remove image</button></div>
          </div>)}</div>
          {images.length === 0 && <p className="upload-instruction">{mode === 'image' ? "Choose or drag 1 image here." : "Choose or drag 1–3 images here."}</p>}
          <div className="image-actions"><button type="button" className="secondary" disabled={readingImage || images.length >= imageLimit} onClick={() => fileInput.current?.click()}>{images.length ? "Add image" : "Choose image"}</button></div>
          <p className="input-help">JPG, PNG, WEBP · Use a clear image. If generation fails, try reducing the file size.</p>
          {imageError && <p className="input-error" role="alert">{imageError}</p>}
          <span className="sr-only" role="status">{readingImage ? "Checking image…" : `${images.length} images selected.`}</span>
        </div>}

        <fieldset><legend>Orientation</legend><div className="choices">
          <button type="button" aria-pressed={orientation === 'portrait'} className={orientation === 'portrait' ? 'selected' : ''} onClick={() => setOrientation('portrait')}><span className="ratio portrait" aria-hidden="true" />Portrait <span className="muted">9:16</span></button>
          <button type="button" aria-pressed={orientation === 'landscape'} className={orientation === 'landscape' ? 'selected' : ''} onClick={() => setOrientation('landscape')}><span className="ratio landscape" aria-hidden="true" />Landscape <span className="muted">16:9</span></button>
        </div></fieldset>
        <fieldset><legend>Resolution</legend><div className="choices">
          <button type="button" aria-pressed={resolution === '720'} className={resolution === '720' ? 'selected' : ''} onClick={() => setResolution('720')}>720p <span className="muted">HD</span></button>
          <button type="button" aria-pressed={resolution === '1080'} className={resolution === '1080' ? 'selected' : ''} onClick={() => setResolution('1080')}>1080p <span className="muted">Full HD</span></button>
        </div></fieldset>
        <div className="duration-setting"><span>Duration</span><strong>{STUDIO_DURATION_SECONDS} seconds <span className="muted">Fixed</span></strong></div>
        <div className="prompt-label"><label htmlFor="prompt">{mode === 'image' ? 'Motion prompt' : mode === 'ingredients' ? 'Describe your ingredients video' : 'Describe your video'}</label><span id="prompt-count" className="muted">{prompt.length}/{VIDEO_INPUT.maxPromptLength}</span></div>
        <textarea id="prompt" maxLength={VIDEO_INPUT.maxPromptLength} value={prompt} aria-invalid={Boolean(promptError)} aria-describedby={`prompt-count prompt-help${promptError ? ' prompt-error' : ''}`}
          onChange={event => setPrompts(previous => ({ ...previous, [mode]: event.target.value }))}
          onBlur={() => setTouched(previous => ({ ...previous, [mode]: true }))}
          placeholder={mode === 'image' ? "Example: The subject smiles as the camera moves slowly forward…" : mode === 'ingredients' ? "Example: Use the woman in image 1 to introduce the product in image 2…" : "Example: A creator introduces a product in a softly lit studio…"} />
        <p id="prompt-help" className="input-help">{mode === 'image' ? "Describe the subject and camera movement." : mode === 'ingredients' ? "Describe each image’s role, the setting and the movement you want." : 'Describe the subject, setting and camera movement.'}</p>
        {promptError && <p id="prompt-error" className="input-error" role="alert">{promptError}</p>}
        </fieldset>
        <button className="primary generate" type="submit" disabled={!generationEnabled || restorePhase!=='ready' || submitting || Boolean(generation && !canGenerateAgain(generation)) || (!pending.current && (credits.status !== 'ready' || credits.balance < 1 || Boolean(validatePrompt(prompt)) || readingImage || (mode !== 'text' && images.length === 0)))} aria-describedby="generation-note">{submitting ? 'Preparing…' : pending.current ? "Check request again" : 'Generate Video'} <span>· {PRODUCT.creditsPerGeneration} Credit</span></button>
        <p id="generation-note" className="phase-note">{generationEnabled ? 'Each generation uses 1 credit. Download your video once it’s ready.' : "Video generation is not enabled. No credits have been used."}</p>
        {restorePhase==='loading'&&<p className="phase-note" role="status">Checking your current video request…</p>}
        {restorePhase==='error'&&<div className="input-error" role="status">Your current request could not be checked. Check it before starting another video.<button type="button" className="secondary" onClick={()=>setRestoreAttempt(value=>value+1)}>Check current request</button></div>}
        {flowError && <div className="input-error" role="alert">{flowError}{pending.current && <p>Request reference: <code>{pending.current.id}</code></p>}{generation && <button type="button" className="secondary" onClick={() => { setFlowError(''); setPollAttempt(previous => previous + 1); }}>Check status again</button>}</div>}
        {credits.status === 'unavailable' ? <p className="phase-note">Your balance is currently unavailable. Please check again in Credits.</p> : credits.balance === 0 ? <p className="phase-note">Your balance is 0 credits.</p> : null}
      </form>
    </section>

    <section ref={previewPanel} className="preview panel" aria-label="Video preview">
      <div className="panel-heading"><span className="step">02</span><h2>Preview</h2><span className="preview-meta">{ratio} · {previewResolution}p</span></div>
      <div className="preview-stage">
        {previewGeneration ? <GenerationResult key={previewGeneration.id} generation={previewGeneration} initialClock={previewGeneration.id===generation?.id?initialClock:undefined} provisionalStartedAt={requestClock?.id===previewGeneration.id?requestClock.started:undefined} consecutiveUnknown={attemptSummary.consecutiveUnknown} usesImages={previewDetails?.mode !== 'text'} onAgain={selectedHistory ? () => setSelectedHistoryId(null) : again} againLabel={selectedHistory ? "Close history preview" : 'Generate Again'} /> : pending.current ? <div className="generation-result"><h3>{submitting?'Preparing…':'Checking request…'}</h3><GenerationTimer key={pending.current.id} id={pending.current.id} provisionalStartedAt={requestClock?.id===pending.current.id?requestClock.started:undefined} /></div> : mode !== 'text' && images.length > 0 ? <>
          <div className={mode === 'image' ? `source-preview ${orientation}` : 'ingredients-preview'}>{mode === 'image' ? <Image src={images[0].url} alt="Source image preview" fill unoptimized sizes="(max-width: 820px) 85vw, 440px" /> : images.map((image, index) => <figure key={image.url}><div className="ingredient-preview-image"><Image src={image.url} alt={`Reference image preview ${index + 1}`} fill unoptimized sizes="(max-width: 820px) 28vw, 150px" /></div><figcaption>Img {index + 1}</figcaption></figure>)}</div>
          <h3>{mode === 'image' ? 'Image preview' : 'Ingredients preview'}</h3><p>{images.length} reference images for your video.</p>
        </> : <>
          <div className={`empty-frame ${orientation}`}><span className="play-icon" aria-hidden="true">▷</span></div>
          <h3>{mode !== 'text' ? <>Choose your<br />reference image</> : <>Your generated video<br />will appear here</>}</h3>
          <p>{mode !== 'text' ? `Choose ${mode === 'image' ? '1' : '1–3'} image(s) to see a preview here.` : 'Preview your video before downloading.'}</p>
        </>}
        <div className="video-specs" aria-label="Selected video settings"><span>{ratio}</span><span>{previewResolution}p</span><span>{STUDIO_DURATION_SECONDS} seconds</span><span>{PRODUCT.creditsPerGeneration} credit</span></div>
      </div>
      <div className="preview-footer"><span aria-hidden="true">↓</span><p>Download your video once it’s ready.<br /><span>Download your video before its expiry time.</span></p></div>
    </section>
  </div><RecentHistory items={history} selectedId={selectedHistory?.id ?? null} onSelect={selectHistory} /></>;
}
