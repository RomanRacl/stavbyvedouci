import type { Metadata } from 'next';
import FreshStartWizard from '@/features/onboarding/FreshStartWizard';

export const metadata: Metadata = { title: 'Začít naostro | Stavbyvedoucí' };

export default function Page() {
  return <FreshStartWizard />;
}
