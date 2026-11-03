import type { Metadata } from 'next';
import AnalyticsPage from '@/features/analytics/AnalyticsPage';

export const metadata: Metadata = { title: 'Analytika | Stavbyvedoucí' };

export default function Page() {
  return <AnalyticsPage />;
}
