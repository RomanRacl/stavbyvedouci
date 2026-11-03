import type { Metadata } from 'next';
import StockPage from '@/features/stock/StockPage';

export const metadata: Metadata = { title: 'Sklad | Stavbyvedoucí' };

export default function Page() {
  return <StockPage />;
}
