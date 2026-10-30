import type { Metadata } from 'next';
import PayrollPrint from '@/features/money/PayrollPrint';

export const metadata: Metadata = { title: 'Mzdové podklady – tisk' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PayrollPrint month={id} />;
}
