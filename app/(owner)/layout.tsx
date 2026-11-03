import type { ReactNode } from 'react';
import { OwnerNav } from '@/components/shell/OwnerNav';

/** Společný rám kanceláře: navigace zůstává při přechodech mezi stránkami na místě. */
export default function OwnerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-concrete">
      <OwnerNav />
      {children}
    </div>
  );
}
