export type WalletTotals = {
 outstandingCredits: number; fundedAccounts: number; walletCheckedAt: string;
 customerCredits: number; customerAccounts: number; internalCredits: number; internalAccounts: number;
 otherCredits: number; otherAccounts: number;
};
export type StockSummary = WalletTotals & {
 providerCredit: number; creditCost: number; availableVideos: number;
 requiredCredit: number; targetCredit: number; suggestedTopUp: number;
 totalRequiredCredit: number; totalTargetCredit: number; totalSuggestedTopUp: number;
 status: 'sufficient' | 'buffer_low' | 'insufficient'; checkedAt: string;
};
function count(value: unknown): number {
 if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 1_000_000_000) throw new Error('invalid_stock_snapshot');
 return value as number;
}
function timestamp(value: unknown): string {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('invalid_stock_snapshot');
 return new Date(value).toISOString();
}
function object(value: unknown): Record<string, unknown> {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_stock_snapshot');
 return value as Record<string, unknown>;
}
// Hundredths prevent 14.70 / 0.15 becoming 97.999... and understating capacity.
function hundredths(value: unknown): number {
 if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1_000_000_000) throw new Error('invalid_stock_snapshot');
 const result = Math.round(value * 100);
 if (Math.abs(value * 100 - result) > 0.00001) throw new Error('invalid_stock_snapshot');
 return result;
}
export function parseWalletTotals(value: unknown): WalletTotals {
 const data = object(value), outstandingCredits = count(data.outstandingCredits), fundedAccounts = count(data.fundedAccounts);
 if (fundedAccounts > outstandingCredits || (outstandingCredits > 0 && fundedAccounts === 0)) throw new Error('invalid_stock_snapshot');
 const customerCredits = count(data.customerCredits), customerAccounts = count(data.customerAccounts);
 const internalCredits = count(data.internalCredits), internalAccounts = count(data.internalAccounts);
 const otherCredits = count(data.otherCredits), otherAccounts = count(data.otherAccounts);
 if (customerCredits + internalCredits + otherCredits !== outstandingCredits ||
  (customerCredits > 0 && customerAccounts === 0) || (internalCredits > 0 && internalAccounts === 0) ||
  otherAccounts > otherCredits || (otherCredits > 0 && otherAccounts === 0) ||
  fundedAccounts > customerAccounts + internalAccounts + otherAccounts) throw new Error('invalid_stock_snapshot');
 return { outstandingCredits, fundedAccounts, walletCheckedAt: timestamp(data.walletCheckedAt),
  customerCredits, customerAccounts, internalCredits, internalAccounts, otherCredits, otherAccounts };
}
export function calculateStock(wallet: WalletTotals, provider: { credit: number; creditCost: number }, checkedAt = new Date().toISOString()): StockSummary {
 const totals = parseWalletTotals(wallet), stock = hundredths(provider.credit), cost = hundredths(provider.creditCost);
 if (cost < 1) throw new Error('invalid_stock_snapshot');
 const required = totals.customerCredits * cost, target = Math.ceil(required * 120 / 100);
 const totalRequired = totals.outstandingCredits * cost, totalTarget = Math.ceil(totalRequired * 120 / 100);
 if (!Number.isSafeInteger(required) || !Number.isSafeInteger(required * 120) || !Number.isSafeInteger(target) || !Number.isSafeInteger(totalRequired * 120)) throw new Error('invalid_stock_snapshot');
 return { ...totals, providerCredit: stock / 100, creditCost: cost / 100,
  availableVideos: Math.floor(stock / cost), requiredCredit: required / 100, targetCredit: target / 100,
  suggestedTopUp: Math.max(0, target - stock) / 100,
  totalRequiredCredit: totalRequired / 100, totalTargetCredit: totalTarget / 100, totalSuggestedTopUp: Math.max(0, totalTarget - stock) / 100,
  status: stock < required ? 'insufficient' : stock < target ? 'buffer_low' : 'sufficient', checkedAt: timestamp(checkedAt) };
}
export function parseStockSummary(value: unknown): StockSummary {
 const data = object(value);
 const result = calculateStock(parseWalletTotals(data), { credit: data.providerCredit as number, creditCost: data.creditCost as number }, timestamp(data.checkedAt));
 for (const field of ['availableVideos', 'requiredCredit', 'targetCredit', 'suggestedTopUp', 'totalRequiredCredit', 'totalTargetCredit', 'totalSuggestedTopUp', 'status'] as const) {
  if (data[field] !== result[field]) throw new Error('invalid_stock_snapshot');
 }
 return result;
}
