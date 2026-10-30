import type { Metadata } from 'next';
import CalendarPage from '@/features/calendar/CalendarPage';

export const metadata: Metadata = { title: 'Kalendář | Stavbyvedoucí' };

export default function Page() {
  return <CalendarPage />;
}
