import type { Metadata } from 'next';
import SalesPage from '@/features/sales/SalesPage';

export const metadata: Metadata = { title: 'Obchod | Stavbyvedoucí' };

export default function Page() {
  return <SalesPage />;
}
