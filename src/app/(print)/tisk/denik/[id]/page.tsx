import type { Metadata } from 'next';
import DiaryPrint from '@/features/dashboard/DiaryPrint';

export const metadata: Metadata = { title: 'Stavební deník – tisk' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DiaryPrint jobId={id} />;
}
