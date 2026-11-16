export const PACKAGES = Object.freeze([
 { id: 'try', name: 'Try', amountSen: 800, credits: 60 },
 { id: 'starter', name: 'Starter', amountSen: 1600, credits: 120 },
 { id: 'creator', name: 'Creator', amountSen: 3200, credits: 250 },
 { id: 'power', name: 'Power', amountSen: 8000, credits: 620 },
]);
// Historical orders retain their exact quoted amount. New orders use PACKAGES only.
const LEGACY_AMOUNTS: Readonly<Record<string, number>> = Object.freeze({ try: 500, starter: 1000, creator: 2000, power: 5000 });
export function paymentPackage(id: unknown, amountSen: unknown, credits: unknown) {
 const pack = PACKAGES.find(p => p.id === id);
 if (!pack || credits !== pack.credits || (amountSen !== pack.amountSen && amountSen !== LEGACY_AMOUNTS[pack.id])) return undefined;
 return { ...pack, amountSen: amountSen as number };
}
export type Payment = { id: string; user_id: string; package_id: string; amount_sen: number; credits: number; status: 'pending' | 'submitted' | 'approved' | 'rejected'; customer_reference: string | null; reason: string | null; created_at: string; whatsapp?: string | null; customer_email?: string | null };
