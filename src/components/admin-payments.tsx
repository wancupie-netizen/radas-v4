'use client';
import { useCallback, useState } from 'react';
import { PaymentPanel } from './payment-panel';
import { ApiStockPanel } from './api-stock-panel';
export function AdminPayments() {
 const [revision, setRevision] = useState(0);
 const refreshStock = useCallback(() => setRevision(value => value + 1), []);
 return <><ApiStockPanel revision={revision}/><PaymentPanel admin onCreditsChanged={refreshStock}/></>;
}
