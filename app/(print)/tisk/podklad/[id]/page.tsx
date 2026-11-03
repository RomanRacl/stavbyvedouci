import type { Metadata } from 'next';
import InvoicePrint from '@/features/money/InvoicePrint';

export const metadata: Metadata = { title: 'Podklad k fakturaci – tisk' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoicePrint jobId={id} />;
}
