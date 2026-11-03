import type { Metadata } from 'next';
import MonthReportPrint from '@/features/analytics/MonthReportPrint';

export const metadata: Metadata = { title: 'Měsíční report – tisk' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MonthReportPrint month={id} />;
}
