import { Suspense } from 'react';
import Dashboard from '@/features/dashboard/Dashboard';
import { MOCK_COMPANY_ID } from '@/lib/mock/dashboard.mock';

/**
 * Serverová stránka je tenká: auth guard dělá middleware (session cookie),
 * companyId a uid přijdou z ověřeného tokenu. V MVP mock hodnoty.
 * Suspense je nutný kvůli useSearchParams (Master-Detail stav v URL).
 */
export default function DashboardPage() {
  return (
    <Suspense>
      <Dashboard companyId={MOCK_COMPANY_ID} companyName="Novák Stavby s.r.o." currentUid="u_owner" />
    </Suspense>
  );
}
