import type { Metadata } from 'next';
import AdvancePrint from '@/features/money/AdvancePrint';

export const metadata: Metadata = { title: 'Daňový doklad k platbě – tisk' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdvancePrint id={decodeURIComponent(id)} kind="receipt" />;
}
