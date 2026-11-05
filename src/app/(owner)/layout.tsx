import type { ReactNode } from 'react';
import { OwnerShell } from '@/components/shell/OwnerNav';

/** Společný rám kanceláře: menu zůstává při přechodech mezi stránkami na místě. */
export default function OwnerLayout({ children }: { children: ReactNode }) {
  return <OwnerShell>{children}</OwnerShell>;
}
