'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { PRODUCT } from '@/lib/config';
import type { CreditSnapshot } from '@/lib/credits/types';
import { VIDEO_INPUT, validateImageFile, validatePrompt, type VideoMode, type VideoOrientation, type VideoResolution } from '@/lib/video/input';

type SourceImage = { file: File; url: string; width: number; height: number };

export function VideoStudio({ credits }: { credits: CreditSnapshot }) {
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
  const ratio = orientation === 'portrait' ? '9:16' : '16:9';

  useEffect(() => () => { selection.current += 1; }, []);
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
    if (files.length === 0) return;
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

  return <div className="studio-grid">
    <section className="generator panel" aria-label="Video settings">
      <div className="panel-heading"><span className="step">01</span><h2>Video settings</h2></div>
      <form noValidate onSubmit={event => event.preventDefault()}>
        <label htmlFor="mode">Generation mode</label>
        <select id="mode" value={mode} onChange={event => setMode(event.target.value as VideoMode)}>
          <option value="text">Text to Video</option><option value="image">Image to Video</option>
        </select>

        {mode === 'image' && <div className={`source-upload${dragging ? ' dragging' : ''}`}
          onDragOver={event => { event.preventDefault(); setDragging(true); }}
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
        <button className="primary generate" type="submit" disabled aria-describedby="generation-note">Generate Video <span>· {PRODUCT.creditsPerGeneration} Credit</span></button>
        <p id="generation-note" className="phase-note">Generation belum tersedia. Tiada credit digunakan.</p>
        {credits.status === 'unavailable' ? <p className="phase-note">Baki belum tersedia. Cuba semak semula di Credits.</p> : credits.balance === 0 ? <p className="phase-note">Baki anda 0 credit.</p> : null}
      </form>
    </section>

    <section className="preview panel" aria-label="Video preview">
      <div className="panel-heading"><span className="step">02</span><h2>Preview</h2><span className="preview-meta">{ratio} · {resolution}p</span></div>
      <div className="preview-stage">
        {mode === 'image' && image ? <>
          <div className={`source-preview ${orientation}`}><Image src={image.url} alt="Preview gambar sumber" fill unoptimized sizes="(max-width: 820px) 85vw, 440px" /></div>
          <h3>Source image preview</h3><p>Gambar sumber untuk Image to Video.</p>
        </> : <>
          <div className={`empty-frame ${orientation}`}><span className="play-icon" aria-hidden="true">▷</span></div>
          <h3>{mode === 'image' ? <>Choose your<br />source image</> : <>Your generated video<br />will appear here</>}</h3>
          <p>{mode === 'image' ? 'Pilih gambar untuk lihat preview di sini.' : 'Preview hasil video sebelum download.'}</p>
        </>}
        <div className="video-specs" aria-label="Selected video settings"><span>{ratio}</span><span>{resolution}p</span><span>{PRODUCT.durationSeconds} saat</span><span>{PRODUCT.creditsPerGeneration} credit</span></div>
      </div>
      <div className="preview-footer"><span aria-hidden="true">↓</span><p>Download terus selepas generate.<br /><span>Video hilang daripada paparan apabila refresh atau logout.</span></p></div>
    </section>
  </div>;
}
