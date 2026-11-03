import type { Metadata } from 'next';
import ToolLabelsPrint from '@/features/operations/ToolLabelsPrint';

export const metadata: Metadata = { title: 'QR štítky – tisk' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ToolLabelsPrint kind={id} />;
}
