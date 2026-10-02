export type CreditTransaction = {
  id: string;
  type: 'topup' | 'debit' | 'refund';
  amount: number;
  balanceAfter: number;
  createdAt: string;
};
export type CreditSnapshot =
  | { status: 'ready'; balance: number; updatedAt: string; transactions: CreditTransaction[] }
  | { status: 'unavailable' };

function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
export function parseSnapshot(value: unknown): CreditSnapshot {
  if (!value || typeof value !== 'object') return { status: 'unavailable' };
  const data = value as Record<string, unknown>;
  if (!integer(data.balance) || typeof data.updatedAt !== 'string' || !Number.isFinite(Date.parse(data.updatedAt)) || !Array.isArray(data.transactions) || data.transactions.length > 20) return { status: 'unavailable' };
  const transactions: CreditTransaction[] = [];
  for (const row of data.transactions) {
    if (!row || typeof row !== 'object') return { status: 'unavailable' };
    const t = row as Record<string, unknown>;
    if (typeof t.id !== 'string' || typeof t.createdAt !== 'string' || !Number.isFinite(Date.parse(t.createdAt)) || !integer(t.balanceAfter) ||
      !((t.type === 'topup' && t.amount === 60) || (t.type === 'debit' && t.amount === -1) || (t.type === 'refund' && t.amount === 1))) return { status: 'unavailable' };
    transactions.push(t as CreditTransaction);
  }
  return { status: 'ready', balance: data.balance, updatedAt: data.updatedAt, transactions };
}
