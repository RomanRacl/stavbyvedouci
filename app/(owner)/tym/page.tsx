import type { Metadata } from 'next';
import TeamPage from '@/features/team/TeamPage';

export const metadata: Metadata = { title: 'Tým | Stavbyvedoucí' };

export default function Page() {
  return <TeamPage />;
}
