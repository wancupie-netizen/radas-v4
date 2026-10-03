export const PACKAGES = Object.freeze([
 { id: 'try', name: 'Try', amountSen: 500, credits: 60 },
 { id: 'starter', name: 'Starter', amountSen: 1000, credits: 120 },
 { id: 'creator', name: 'Creator', amountSen: 2000, credits: 250 },
 { id: 'power', name: 'Power', amountSen: 5000, credits: 620 },
]);
export type Payment = { id: string; user_id: string; package_id: string; amount_sen: number; credits: number; status: 'pending' | 'submitted' | 'approved' | 'rejected'; customer_reference: string | null; reason: string | null; created_at: string };
