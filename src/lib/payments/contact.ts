// Store international digits only; accept common Malaysian local formatting.
export function normalizeWhatsApp(value: unknown): string | null {
 if (typeof value !== 'string' || value.length > 40 || !/^[+0-9 ()-]+$/.test(value.trim())) return null;
 let number = value.trim().replace(/[ ()-]/g, '');
 if (number.startsWith('+')) number = number.slice(1);
 if (number.startsWith('01')) number = '6' + number;
 return /^[1-9][0-9]{7,14}$/.test(number) ? number : null;
}
