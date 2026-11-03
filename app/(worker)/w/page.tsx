import type { Metadata } from 'next';
import { Suspense } from 'react';
import WorkerApp from '@/features/worker/WorkerApp';

export const metadata: Metadata = { title: 'Moje zakázky' };

/** Mobilní rozhraní dělníka. Krátká adresa /w, aby se dala snadno napsat do telefonu. */
export default function WorkerPage() {
  return (
    <Suspense>
      <WorkerApp />
    </Suspense>
  );
}
