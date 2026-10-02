export const VIDEO_INPUT = Object.freeze({ maxPromptLength: 2000, maxImageBytes: 10 * 1024 * 1024 });
export type VideoMode = 'text' | 'image';
export type VideoOrientation = 'portrait' | 'landscape';
export type VideoResolution = '720' | '1080';

export function validatePrompt(prompt: string): string | null {
  if (!prompt.trim()) return 'Masukkan prompt video anda.';
  if (prompt.length > VIDEO_INPUT.maxPromptLength) return 'Prompt maksimum 2000 aksara.';
  return null;
}

// Local UI validation only. The future upload endpoint must revalidate independently.
export async function validateImageFile(file: Pick<File, 'type' | 'size' | 'slice'>): Promise<string | null> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Pilih gambar JPG, PNG atau WEBP.';
  if (file.size === 0) return 'Fail gambar kosong. Pilih gambar lain.';
  if (file.size > VIDEO_INPUT.maxImageBytes) return 'Saiz gambar maksimum 10 MB.';
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
  const isWebp = bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80;
  if (!((file.type === 'image/jpeg' && isJpeg) || (file.type === 'image/png' && isPng) || (file.type === 'image/webp' && isWebp))) return 'Kandungan fail bukan gambar yang sah.';
  return null;
}
