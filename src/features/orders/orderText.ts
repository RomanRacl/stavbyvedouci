import { MOCK_COMPANY } from '@/lib/mock/dashboard.mock';
import type { MaterialItem, PurchaseOrder } from '@/types/firestore';

const qty = (n: number) => n.toLocaleString('cs-CZ');

/** Text objednávky pro e-mail dodavateli (bez cen – ty si dodavatel doplní sám). */
export interface Sender {
  name: string;
  owner: string;
  phone: string;
}

/** Odesílatel objednávek: údaje firmy z Nastavení a jméno majitele. */
export const senderOf = (settings: { name: string; phone: string }, owner?: string): Sender => ({
  name: settings.name || MOCK_COMPANY.name,
  phone: settings.phone,
  owner: owner ?? '',
});

export function orderEmailBody(order: PurchaseOrder, catalog: MaterialItem[], jobCode?: string, from: Sender = MOCK_COMPANY) {
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
    from.owner,
    from.name,
    from.phone ? `tel. ${from.phone}` : '',
  ]
    .filter((l, i, arr) => !(l === '' && (arr[i - 1] === '' || i === arr.length - 1)))
    .join('\n');
}

export function orderMailto(order: PurchaseOrder, email: string, catalog: MaterialItem[], jobCode?: string, from: Sender = MOCK_COMPANY) {
  const subject = `Objednávka ${order.number}, ${from.name}`;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(orderEmailBody(order, catalog, jobCode, from))}`;
}

export const ORDER_STATUS: Record<PurchaseOrder['status'], { label: string; cls: string }> = {
  draft: { label: 'Koncept', cls: 'bg-concrete text-ink-2' },
  sent: { label: 'Odesláno', cls: 'bg-series-1/10 text-series-1-ink' },
  received: { label: 'Přijato', cls: 'bg-good/12 text-good-ink' },
};
