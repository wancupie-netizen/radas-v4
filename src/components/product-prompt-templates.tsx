'use client';
import { useRef, useState } from 'react';
import { productTemplates } from '@/lib/affiliate/templates';
import { contentTypeLabel } from '@/lib/affiliate/labels';

function PromptTemplate({ type, text, name }: { type: string; text: string; name: string }) {
 const label = contentTypeLabel(type);
 const [status, setStatus] = useState('');
 const [copying, setCopying] = useState(false);
 const field = useRef<HTMLTextAreaElement>(null);
 async function copy() {
  setStatus(''); setCopying(true);
  try {
   // Invoke directly from the click: older Safari requires the user gesture.
   await navigator.clipboard.writeText(text);
   setStatus("Copied. Paste it into your preferred AI tool.");
  } catch {
   setStatus("Automatic copying is unavailable. Press and hold or select the text above to copy it manually.");
   field.current?.focus(); field.current?.select();
  } finally { setCopying(false); }
 }
 return <details className="affiliate-prompt-item">
  <summary>Example video: {label}</summary>
  <textarea ref={field} aria-label={`Template ${label} for ${name || "product"}`} value={text} readOnly rows={8} spellCheck={false}/>
  <button className="secondary" type="button" disabled={copying} onClick={() => void copy()} aria-label={`Copy template ${label}`}>{copying ? "Copying…" : "Copy template"}</button>
  <p className="input-help" role="status">{status}</p>
 </details>;
}

export function ProductPromptTemplates({ name, contentTypes, preview = false }: { name: string; contentTypes: readonly string[]; preview?: boolean }) {
 const templates = productTemplates(name, contentTypes);
 if (templates.length === 0) return null;
 return <details className="affiliate-prompts">
  <summary>Get Video Ideas with AI</summary>
  {preview && <p className="input-help">Preview based on the selected content types. Save the product to update the user view.</p>}
  <p className="input-help">Copy the template into your preferred AI tool. Replace the information in [brackets] and include a product image if available.</p>
  {templates.map(template => <PromptTemplate key={`${template.type}:${template.text}`} {...template} name={name}/>)}
  <p className="input-help">These templates are starting points. Verify the product facts, adapt the script and review the AI output before publishing. The final decisions and effort are yours.</p>
 </details>;
}
