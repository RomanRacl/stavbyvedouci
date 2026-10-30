import type { Metadata } from 'next';
import OrderPrint from '@/features/orders/OrderPrint';

export const metadata: Metadata = { title: 'Objednávka – tisk' };

/** Next 15: params jsou Promise. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderPrint id={id} />;
}
