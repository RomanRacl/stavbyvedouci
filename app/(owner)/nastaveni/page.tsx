import type { Metadata } from 'next';
import SettingsPage from '@/features/settings/SettingsPage';

export const metadata: Metadata = { title: 'Nastavení | Stavbyvedoucí' };

export default function Page() {
  return <SettingsPage />;
}
