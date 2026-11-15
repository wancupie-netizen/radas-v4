export type AuthState = { error?: string; message?: string };
export function readCredentials(data: FormData, register = false) {
  const email = typeof data.get('email') === 'string' ? String(data.get('email')).trim().toLowerCase() : '';
  const password = typeof data.get('password') === 'string' ? String(data.get('password')) : '';
  const name = typeof data.get('name') === 'string' ? String(data.get('name')).trim() : '';
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  if (!password || password.length > 128) return { error: "Enter a valid password." };
  if (register && (password.length < 8 || new TextEncoder().encode(password).length > 72)) return { error: "Your password must contain at least 8 characters and no more than 72 bytes." };
  if (register && (!name || name.length > 80)) return { error: "Enter a name between 1 and 80 characters." };
  return { email, password, name };
}
