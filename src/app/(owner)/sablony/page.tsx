import type { Metadata } from 'next';
import TemplatesPage from '@/features/templates/TemplatesPage';

export const metadata: Metadata = { title: 'Šablony zakázek | Stavbyvedoucí' };

export default function Page() {
  return <TemplatesPage />;
}
