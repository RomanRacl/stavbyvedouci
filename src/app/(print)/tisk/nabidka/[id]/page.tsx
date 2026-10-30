import type { Metadata } from 'next';
import QuotePrint from '@/features/quotes/QuotePrint';

export const metadata: Metadata = { title: 'Cenová nabídka – tisk' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuotePrint id={id} />;
}
