import type { Metadata } from 'next';
import MoneyPage from '@/features/money/MoneyPage';

export const metadata: Metadata = { title: 'Peníze | Stavbyvedoucí' };

export default function Page() {
  return <MoneyPage />;
}
