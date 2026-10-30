import { MOCK_COMPANY } from '@/lib/mock/dashboard.mock';
import type { MaterialItem, PurchaseOrder } from '@/types/firestore';

const qty = (n: number) => n.toLocaleString('cs-CZ');

/** Text objednávky pro e-mail dodavateli (bez cen – ty si dodavatel doplní sám). */
export function orderEmailBody(order: PurchaseOrder, catalog: MaterialItem[], jobCode?: string) {
  const lines = order.lines
    .map((l, i) => {
      const sku = catalog.find((c) => c.id === l.materialId)?.sku;
      return `${i + 1}. ${l.name}${sku ? ` (kód ${sku})` : ''}: ${qty(l.qty)} ${l.unit}`;
    })
    .join('\n');
  return [
    'Dobrý den,',
    '',
    `objednáváme u Vás následující zboží (objednávka ${order.number}${jobCode ? `, zakázka ${jobCode}` : ''}):`,
    '',
    lines,
    '',
    order.note ? `Poznámka: ${order.note}\n` : '',
    'Prosíme o potvrzení objednávky a termínu dodání.',
    '',
    'S pozdravem',
    MOCK_COMPANY.owner,
    MOCK_COMPANY.name,
    `tel. ${MOCK_COMPANY.phone}`,
  ]
    .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
    .join('\n');
}

export function orderMailto(order: PurchaseOrder, email: string, catalog: MaterialItem[], jobCode?: string) {
  const subject = `Objednávka ${order.number}, ${MOCK_COMPANY.name}`;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(orderEmailBody(order, catalog, jobCode))}`;
}

export const ORDER_STATUS: Record<PurchaseOrder['status'], { label: string; cls: string }> = {
  draft: { label: 'Koncept', cls: 'bg-concrete text-ink-2' },
  sent: { label: 'Odesláno', cls: 'bg-series-1/10 text-series-1-ink' },
  received: { label: 'Přijato', cls: 'bg-good/12 text-good-ink' },
};
