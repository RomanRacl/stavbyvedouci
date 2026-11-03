import type { Metadata } from 'next';
import OperationsPage from '@/features/operations/OperationsPage';

export const metadata: Metadata = { title: 'Provoz | Stavbyvedoucí' };

export default function Page() {
  return <OperationsPage />;
}
