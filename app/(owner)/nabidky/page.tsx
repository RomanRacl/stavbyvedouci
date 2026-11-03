import type { Metadata } from 'next';
import QuotesPage from '@/features/quotes/QuotesPage';

export const metadata: Metadata = { title: 'Nabídky | Stavbyvedoucí' };

export default function Page() {
  return <QuotesPage />;
}
