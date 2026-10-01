export type AuthState = { error?: string; message?: string };
export function readCredentials(data: FormData, register = false) {
  const email = typeof data.get('email') === 'string' ? String(data.get('email')).trim().toLowerCase() : '';
  const password = typeof data.get('password') === 'string' ? String(data.get('password')) : '';
  const name = typeof data.get('name') === 'string' ? String(data.get('name')).trim() : '';
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Masukkan alamat email yang sah.' };
  if (!password || password.length > 128) return { error: 'Masukkan password yang sah.' };
  if (register && (password.length < 8 || new TextEncoder().encode(password).length > 72)) return { error: 'Password perlu sekurang-kurangnya 8 aksara dan maksimum 72 bait.' };
  if (register && (!name || name.length > 80)) return { error: 'Masukkan nama antara 1 hingga 80 aksara.' };
  return { email, password, name };
}
