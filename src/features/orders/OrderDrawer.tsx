'use client';

import { Mail, PackageCheck, Printer, Send, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { btnPrimary, btnSecondary, inputCls } from '@/components/shell/PageHeader';
import { fmt } from '@/features/analytics/lib/metrics';
import { MaterialSearch } from '@/features/materials/MaterialSearch';
import { MOCK_COMPANY } from '@/lib/mock/dashboard.mock';
import { deleteOrder, markOrderSent, receiveOrder, setSupplierEmail, updateOrder, type Snapshot } from '@/lib/mock/localBackend';
import { orderTotal } from '@/lib/stock';
import type { OrderLine, PurchaseOrder } from '@/types/firestore';
import { ORDER_STATUS, orderMailto } from './orderText';

interface Props {
  order: PurchaseOrder | null;
  snap: Snapshot;
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}

/** Detail objednávky: úprava konceptu, tisk/PDF, odeslání e-mailem a příjem na sklad. */
export function OrderDrawer({ order: initial, snap, open, onClose, onDone }: Props) {
  const order = initial ? snap.orders.find((o) => o.id === initial.id) ?? initial : null;
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [note, setNote] = useState('');
  const [email, setEmail] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (open && order) {
      setLines(order.lines.map((l) => ({ ...l })));
      setNote(order.note);
      setEmail(snap.suppliers.find((s) => s.name === order.supplier)?.email ?? '');
      setConfirmDel(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- koncept se načte jen při otevření
  }, [open, order?.id]);

  if (!order) return null;
  const draft = order.status === 'draft';
  const job = order.jobId ? snap.jobs.find((j) => j.id === order.jobId) : null;
  const dirty = draft && (JSON.stringify(lines) !== JSON.stringify(order.lines) || note !== order.note);
  const persist = () => dirty && updateOrder(order.id, { lines: lines.filter((l) => l.qty > 0), note });
  const savedEmail = snap.suppliers.find((s) => s.name === order.supplier)?.email ?? '';
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  return (
    <Drawer
      open={open}
      onClose={() => {
        persist();
        onClose();
      }}
      title={`Objednávka ${order.number}`}
      subtitle={`${order.supplier}${job ? `, pro zakázku ${job.code}` : ''}`}
      width={620}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {draft &&
            (confirmDel ? (
              <button
                type="button"
                onClick={() => {
                  deleteOrder(order.id);
                  onDone('Koncept objednávky smazán.');
                }}
                className="h-10 rounded-lg bg-crit px-3 text-sm font-semibold text-white"
              >
                Opravdu smazat
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmDel(true)} className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-ink-2 hover:bg-crit/10 hover:text-crit-ink">
                <Trash2 className="size-4" /> Smazat
              </button>
            ))}
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => {
              persist();
              window.open(`/tisk/objednavka/${order.id}`, '_blank');
            }}
            className={btnSecondary}
          >
            <Printer className="size-4" /> Tisk / PDF
          </button>
          {order.status !== 'received' && (
            <button
              type="button"
              onClick={() => {
                persist();
                receiveOrder(MOCK_COMPANY.uid, order.id);
                onDone(`Zboží z ${order.number} je naskladněné v hlavním skladu.`);
              }}
              className={btnPrimary}
            >
              <PackageCheck className="size-4" /> Přijmout na sklad
            </button>
          )}
        </div>
      }
    >
      <div className="mb-5 flex items-center gap-2 text-sm">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ORDER_STATUS[order.status].cls}`}>{ORDER_STATUS[order.status].label}</span>
        <span className="text-ink-2">
          vytvořeno {fmt.dateTime(order.createdAt)}
          {order.sentAt && `, odesláno ${fmt.dateTime(order.sentAt)}`}
          {order.receivedAt && `, přijato ${fmt.dateTime(order.receivedAt)}`}
        </span>
      </div>

      <section>
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-concrete/60 text-left text-xs text-ink-2">
              <tr>
                <th className="px-3 py-2 font-medium">Položka</th>
                <th className="w-28 px-3 py-2 text-right font-medium">Množství</th>
                <th className="w-28 px-3 py-2 text-right font-medium">Celkem</th>
                {draft && <th className="w-10" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lines.map((l) => (
                <tr key={l.materialId}>
                  <td className="px-3 py-2">
                    <span className="block text-ink">{l.name}</span>
                    <span className="block text-xs text-ink-3 tabular-nums">{fmt.czk(l.unitCost)}/{l.unit}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {draft ? (
                      <span className="inline-flex items-center gap-1">
                        <input
                          inputMode="numeric"
                          aria-label={`Množství ${l.name}`}
                          value={l.qty}
                          onChange={(e) => setLines((ls) => ls.map((x) => (x.materialId === l.materialId ? { ...x, qty: Number(e.target.value.replace(/\D/g, '')) || 0 } : x)))}
                          className="h-8 w-20 rounded-md border border-line px-2 text-right tabular-nums focus:border-series-1 focus:outline-none"
                        />
                        <span className="w-6 text-left text-xs text-ink-3">{l.unit}</span>
                      </span>
                    ) : (
                      <span className="tabular-nums">
                        {fmt.num(l.qty)} {l.unit}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-ink tabular-nums">{fmt.czk(l.qty * l.unitCost)}</td>
                  {draft && (
                    <td className="pr-2">
                      <button
                        type="button"
                        aria-label={`Odebrat ${l.name}`}
                        onClick={() => setLines((ls) => ls.filter((x) => x.materialId !== l.materialId))}
                        className="grid size-8 place-items-center rounded text-ink-3 hover:bg-crit/10 hover:text-crit-ink"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line">
                <td className="px-3 py-2 font-medium text-ink">Celkem bez DPH (odhad podle ceníku)</td>
                <td />
                <td className="px-3 py-2 text-right font-semibold text-ink tabular-nums">{fmt.czk(orderTotal(lines))}</td>
                {draft && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
        {draft && (
          <div className="mt-4">
            <p className="mb-1.5 text-sm font-semibold text-ink">Přidat položku</p>
            <MaterialSearch
              catalog={snap.catalog.filter((c) => c.supplier === order.supplier)}
              excludeIds={lines.map((l) => l.materialId)}
              onPick={(m) => setLines((ls) => [...ls, { materialId: m.id, name: m.name, unit: m.unit, qty: m.unit === 'm' ? 50 : 1, unitCost: m.unitCost }])}
            />
          </div>
        )}
      </section>

      <label className="mt-6 block text-sm font-semibold text-ink">
        Poznámka pro dodavatele
        <textarea
          value={note}
          disabled={!draft}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="např. dodat na stavbu Lesní 14 do pátku"
          className="mt-1.5 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm font-normal text-ink focus:border-series-1 focus:outline-none disabled:bg-concrete/50"
        />
      </label>

      {order.status !== 'received' && (
        <section className="mt-6 rounded-lg bg-concrete/60 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Mail className="size-4" /> Odeslat e-mailem
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => email !== savedEmail && emailValid && setSupplierEmail(order.supplier, email)}
              placeholder={`E-mail dodavatele ${order.supplier}`}
              className={`${inputCls} min-w-56 flex-1`}
            />
            <a
              href={emailValid ? orderMailto({ ...order, lines, note }, email, snap.catalog, job?.code) : undefined}
              aria-disabled={!emailValid}
              onClick={() => {
                if (!emailValid) return;
                persist();
                if (email !== savedEmail) setSupplierEmail(order.supplier, email);
                if (draft) markOrderSent(order.id);
                onDone(`Objednávka ${order.number} připravená v e-mailu a označená jako odeslaná.`);
              }}
              className={`${btnPrimary} ${emailValid ? '' : 'pointer-events-none bg-line text-ink-3'}`}
            >
              <Send className="size-4" /> Otevřít e-mail
            </a>
          </div>
          <p className="mt-2 text-xs text-ink-3">
            Otevře se váš e-mailový program s připraveným textem objednávky. E-mail dodavatele se zapamatuje.
            {draft && (
              <>
                {' '}
                Objednáváte jinak (telefonem, v e-shopu)?{' '}
                <button
                  type="button"
                  onClick={() => {
                    persist();
                    markOrderSent(order.id);
                    onDone(`Objednávka ${order.number} označená jako odeslaná.`);
                  }}
                  className="font-medium text-series-1-ink underline underline-offset-2"
                >
                  Jen označit jako odeslanou
                </button>
              </>
            )}
          </p>
        </section>
      )}
    </Drawer>
  );
}
