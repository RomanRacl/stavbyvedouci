import type { Metadata } from 'next';
import OrdersPage from '@/features/orders/OrdersPage';

export const metadata: Metadata = { title: 'Objednávky | Stavbyvedoucí' };

export default function Page() {
  return <OrdersPage />;
}
