'use client';
import { useRef, useState } from 'react';
import { productTemplates } from '@/lib/affiliate/templates';

function PromptTemplate({ type, text, name }: { type: string; text: string; name: string }) {
 const [status, setStatus] = useState('');
 const [copying, setCopying] = useState(false);
 const field = useRef<HTMLTextAreaElement>(null);
 async function copy() {
  setStatus(''); setCopying(true);
  try {
   // Invoke directly from the click: older Safari requires the user gesture.
   await navigator.clipboard.writeText(text);
   setStatus('Disalin. Tampal ke AI tool pilihan anda.');
  } catch {
   setStatus('Salin automatik tidak tersedia. Tekan lama atau pilih teks di atas untuk salin secara manual.');
   field.current?.focus(); field.current?.select();
  } finally { setCopying(false); }
 }
 return <details className="affiliate-prompt-item">
  <summary>Contoh video {type}</summary>
  <textarea ref={field} aria-label={`Templat ${type} untuk ${name || 'produk'}`} value={text} readOnly rows={8} spellCheck={false}/>
  <button className="secondary" type="button" disabled={copying} onClick={() => void copy()} aria-label={`Salin templat ${type}`}>{copying ? 'Menyalin…' : 'Salin templat'}</button>
  <p className="input-help" role="status">{status}</p>
 </details>;
}

export function ProductPromptTemplates({ name, contentTypes, preview = false }: { name: string; contentTypes: readonly string[]; preview?: boolean }) {
 const templates = productTemplates(name, contentTypes);
 if (templates.length === 0) return null;
 return <details className="affiliate-prompts">
  <summary>Dapatkan Idea Video dengan AI</summary>
  {preview && <p className="input-help">Pratonton mengikut pilihan content. Simpan produk untuk mengemas kini paparan pengguna.</p>}
  <p className="input-help">Salin templat ke AI tool pilihan anda. Gantikan maklumat dalam [kurungan] dan sertakan gambar produk jika ada.</p>
  {templates.map(template => <PromptTemplate key={`${template.type}:${template.text}`} {...template} name={name}/>)}
  <p className="input-help">Templat ini ialah cadangan permulaan. Semak fakta produk, sesuaikan skrip dan periksa hasil AI sebelum diterbitkan. Keputusan serta usaha akhir terletak pada anda.</p>
 </details>;
}
