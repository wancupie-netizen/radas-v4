export const VIDEO_INPUT = Object.freeze({ maxPromptLength: 2000, maxImageBytes: 10 * 1024 * 1024, maxImages: 3 });
export type VideoMode = 'text' | 'image' | 'ingredients';
export type VideoOrientation = 'portrait' | 'landscape';
export type VideoResolution = '720' | '1080';

export function validatePrompt(prompt: string): string | null {
  if (!prompt.trim()) return "Enter your video prompt.";
  if (prompt.length > VIDEO_INPUT.maxPromptLength) return "The prompt must not exceed 2,000 characters.";
  return null;
}

// Local UI validation only. The future upload endpoint must revalidate independently.
export async function validateImageFile(file: Pick<File, 'type' | 'size' | 'slice'>): Promise<string | null> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return "Choose a JPG, PNG or WEBP image.";
  if (file.size === 0) return "The image file is empty. Choose another image.";
  if (file.size > VIDEO_INPUT.maxImageBytes) return "The maximum image size is 10 MB.";
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
  const isWebp = bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80;
  if (!((file.type === 'image/jpeg' && isJpeg) || (file.type === 'image/png' && isPng) || (file.type === 'image/webp' && isWebp))) return "The file does not contain a valid image.";
  return null;
}
