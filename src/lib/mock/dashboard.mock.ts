import type { AuditEntry, Certificate, RecurringPlan, CompanySettings, Job, JobNote, JobTemplate, MaterialItem, Member, MaterialUsage, PeriodStat, Quote, StockMove, Supplier, TimeLog, Van } from '@/types/firestore';

/** Mock data 1:1 podle schématu Firestore (po konvertoru Timestamp -> Date). */

const d = (iso: string) => new Date(iso);
/** Ukázkové časovače běží „od rána“ relativně k okamžiku načtení, ne k pevnému datu. */
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

export const MOCK_COMPANY_ID = 'cmp_novak_stavby';
/** Ukázková (smyšlená) firma – údaje pro hlavičku objednávek a dokumentů. */
export const MOCK_COMPANY = { name: 'Novák Stavby s.r.o.', address: 'Nádražní 1, 591 01 Žďár nad Sázavou', phone: '+420 602 111 222', owner: 'Petr Novák', uid: 'u_owner' };

export const mockMembers: Member[] = [
  { uid: 'u_owner', displayName: 'Petr Novák', initials: 'PN', role: 'owner', phone: '+420 602 111 222', hourlyCost: 0, active: true, activeTimer: null },
  { uid: 'u_dvorak', displayName: 'Jan Dvořák', initials: 'JD', role: 'worker', phone: '+420 603 445 120', hourlyCost: 380, active: true, activeTimer: { logId: 'tl_901', jobId: 'job_0142', startedAt: minutesAgo(95) } },
  { uid: 'u_kral', displayName: 'Martin Král', initials: 'MK', role: 'worker', phone: '+420 731 202 334', hourlyCost: 360, active: true, activeTimer: { logId: 'tl_902', jobId: 'job_0142', startedAt: minutesAgo(88) } },
  { uid: 'u_hajek', displayName: 'Tomáš Hájek', initials: 'TH', role: 'worker', phone: '+420 724 889 010', hourlyCost: 420, active: true, activeTimer: { logId: 'tl_903', jobId: 'job_0145', startedAt: minutesAgo(130) } },
  { uid: 'u_benes', displayName: 'Lukáš Beneš', initials: 'LB', role: 'worker', phone: '+420 608 300 765', hourlyCost: 340, active: true, activeTimer: null },
  { uid: 'u_svoboda', displayName: 'Ondřej Svoboda', initials: 'OS', role: 'manager', phone: '+420 777 610 482', hourlyCost: 450, active: true, activeTimer: null },
];

export const mockJobs: Job[] = [
  {
    id: 'job_0142', code: 'Z-2026-0142', title: 'Elektroinstalace RD, 2. NP', trade: 'electro', status: 'in_progress',
    client: { name: 'Ing. Kateřina Malá', phone: '+420 605 778 901', address: 'Lesní 14, Žďár nad Sázavou', geo: { lat: 49.5626, lng: 15.9392 } },
    assignedWorkerIds: ['u_dvorak', 'u_kral'],
    schedule: { start: d('2026-10-12'), due: d('2026-11-06') },
    budget: { revenue: 186000, laborHours: 160, laborCost: 59200, materialCost: 48500 },
    actuals: { laborHours: 118, laborCost: 43900, materialCost: 41200, updatedAt: d('2026-10-28T09:40:00') },
    progressPct: 65,
    stages: [
      { id: 'st_0142a', name: 'Hrubá instalace', plannedHours: 70, progressPct: 100, doneAt: d('2026-10-22T15:00:00') },
      { id: 'st_0142b', name: 'Kompletace', plannedHours: 60, progressPct: 60, doneAt: null },
      { id: 'st_0142c', name: 'Revize', plannedHours: 30, progressPct: 0, doneAt: null },
    ],
    safety: {
      text: '• Před prací vypnout a zajistit jistič proti zapnutí, ověřit beznapěťový stav zkoušečkou.\n• V domě žije pes, dveře na zahradu nechat zavřené.\n• Na stavbě vždy pracovní obuv S3, rukavice a ochranné brýle při řezání a vrtání.\n• Úraz nebo skoronehodu hned nahlásit mistrovi.',
      confirmations: { u_dvorak: d('2026-10-12T06:55:00'), u_kral: d('2026-10-12T07:02:00') },
    },
    vatMode: 'reduced12',
    payments: [{ id: 'pay_seed1', label: 'Záloha 40 %', amount: 83328, dueDate: d('2026-10-09'), issuedAt: d('2026-10-02'), paidAt: d('2026-10-07') }],
    materialPlan: [
      { materialId: 'mat_cyky3x25', name: 'Kabel CYKY-J 3×2,5', unit: 'm', unitCost: 32, plannedQty: 600, usedQty: 470 },
      { materialId: 'mat_cyky3x15', name: 'Kabel CYKY-J 3×1,5', unit: 'm', unitCost: 22, plannedQty: 450, usedQty: 380 },
      { materialId: 'mat_krabkp68', name: 'Krabice KP 68', unit: 'ks', unitCost: 14, plannedQty: 80, usedQty: 61 },
      { materialId: 'mat_jistic16b', name: 'Jistič 1P B16', unit: 'ks', unitCost: 165, plannedQty: 24, usedQty: 10 },
      { materialId: 'mat_rozv36', name: 'Rozvodnice 36 mod.', unit: 'ks', unitCost: 2890, plannedQty: 1, usedQty: 1 },
    ],
    extraWork: [
      { id: 'ew_seed1', description: 'Zákazník chce 4 zásuvky navíc v garáži včetně samostatného jističe', hours: 6, materialCost: 2400, price: null, status: 'pending', createdBy: 'u_dvorak', createdAt: d('2026-10-27T13:20:00'), decidedAt: null },
    ],
    approval: null, createdAt: d('2026-10-02'), updatedAt: d('2026-10-28T09:40:00'),
  },
  {
    id: 'job_0145', code: 'Z-2026-0145', title: 'Výměna stoupaček, bytový dům', trade: 'plumbing', status: 'in_progress',
    client: { name: 'SVJ Nádražní 8', phone: '+420 566 620 100', address: 'Nádražní 8, Nové Město na Moravě', geo: { lat: 49.5614, lng: 16.0742 } },
    assignedWorkerIds: ['u_hajek', 'u_benes'],
    schedule: { start: d('2026-10-19'), due: d('2026-11-20') },
    budget: { revenue: 412000, laborHours: 320, laborCost: 124800, materialCost: 138000 },
    actuals: { laborHours: 96, laborCost: 38100, materialCost: 71400, updatedAt: d('2026-10-28T10:05:00') },
    progressPct: 30,
    vatMode: 'reduced12',
    payments: [
      { id: 'pay_seed2', label: 'Záloha na materiál', amount: 154560, dueDate: d('2026-10-17'), issuedAt: d('2026-10-05'), paidAt: d('2026-10-15') },
      { id: 'pay_seed3', label: 'Průběžná platba po 50 %', amount: 150000, dueDate: d('2026-10-27'), issuedAt: d('2026-10-20'), paidAt: null },
    ],
    materialPlan: [
      { materialId: 'mat_ppr32', name: 'Trubka PPR 32 PN20', unit: 'm', unitCost: 118, plannedQty: 420, usedQty: 190 },
      { materialId: 'mat_ppr25', name: 'Trubka PPR 25 PN20', unit: 'm', unitCost: 74, plannedQty: 380, usedQty: 140 },
      { materialId: 'mat_izol32', name: 'Izolace Tubolit 32/13', unit: 'm', unitCost: 41, plannedQty: 420, usedQty: 160 },
      { materialId: 'mat_ventil', name: 'Kulový ventil 5/4"', unit: 'ks', unitCost: 486, plannedQty: 32, usedQty: 14 },
    ],
    approval: null, createdAt: d('2026-10-05'), updatedAt: d('2026-10-28T10:05:00'),
  },
  {
    id: 'job_0139', code: 'Z-2026-0139', title: 'Montáž oken, kanceláře 3. patro', trade: 'windows', status: 'awaiting_approval',
    client: { name: 'Vysočina Logistics s.r.o.', phone: '+420 566 777 300', address: 'Jihlavská 2210, Žďár nad Sázavou', geo: null },
    assignedWorkerIds: ['u_benes', 'u_svoboda'],
    schedule: { start: d('2026-10-01'), due: d('2026-10-24') },
    budget: { revenue: 268000, laborHours: 96, laborCost: 37400, materialCost: 152000 },
    actuals: { laborHours: 104, laborCost: 41300, materialCost: 149800, updatedAt: d('2026-10-24T16:20:00') },
    progressPct: 100,
    materialPlan: [
      { materialId: 'mat_okno1215', name: 'Okno plast. 120×150, trojsklo', unit: 'ks', unitCost: 11800, plannedQty: 12, usedQty: 12 },
      { materialId: 'mat_pena', name: 'PU pěna nízkoexp. 750 ml', unit: 'ks', unitCost: 189, plannedQty: 30, usedQty: 34 },
      { materialId: 'mat_paska', name: 'Okenní páska vnitřní', unit: 'm', unitCost: 26, plannedQty: 140, usedQty: 152 },
    ],
    approval: null, createdAt: d('2026-09-18'), updatedAt: d('2026-10-24T16:20:00'),
  },
  {
    id: 'job_0137', code: 'Z-2026-0137', title: 'Rekonstrukce koupelny', trade: 'construction', status: 'awaiting_approval',
    client: { name: 'Pavel Jelínek', phone: '+420 722 019 555', address: 'Polní 3, Bystřice nad Pernštejnem', geo: null },
    assignedWorkerIds: ['u_hajek', 'u_kral'],
    schedule: { start: d('2026-09-29'), due: d('2026-10-23') },
    budget: { revenue: 154000, laborHours: 110, laborCost: 42900, materialCost: 51000 },
    actuals: { laborHours: 141, laborCost: 55200, materialCost: 58900, updatedAt: d('2026-10-23T15:00:00') },
    progressPct: 100,
    materialPlan: [
      { materialId: 'mat_obklad', name: 'Obklad 30×60 rektif.', unit: 'm', unitCost: 690, plannedQty: 32, usedQty: 36 },
      { materialId: 'mat_lepidlo', name: 'Flex. lepidlo C2TE', unit: 'bal', unitCost: 345, plannedQty: 14, usedQty: 18 },
      { materialId: 'mat_hydro', name: 'Hydroizolační stěrka', unit: 'kg', unitCost: 118, plannedQty: 20, usedQty: 24 },
    ],
    approval: null, createdAt: d('2026-09-10'), updatedAt: d('2026-10-23T15:00:00'),
  },
  {
    id: 'job_0148', code: 'Z-2026-0148', title: 'Tepelné čerpadlo vzduch–voda', trade: 'hvac', status: 'scheduled',
    client: { name: 'Rodina Pokorných', phone: '+420 739 450 118', address: 'Za Humny 22, Velké Meziříčí', geo: null },
    assignedWorkerIds: ['u_svoboda', 'u_dvorak'],
    schedule: { start: d('2026-11-03'), due: d('2026-11-14') },
    budget: { revenue: 298000, laborHours: 72, laborCost: 30200, materialCost: 196000 },
    actuals: { laborHours: 0, laborCost: 0, materialCost: 0, updatedAt: d('2026-10-27T12:00:00') },
    progressPct: 0,
    materialPlan: [
      { materialId: 'mat_tc9kw', name: 'TČ split 9 kW', unit: 'ks', unitCost: 158000, plannedQty: 1, usedQty: 0 },
      { materialId: 'mat_cu', name: 'Cu potrubí 3/8" + 5/8"', unit: 'm', unitCost: 410, plannedQty: 14, usedQty: 0 },
    ],
    approval: null, createdAt: d('2026-10-20'), updatedAt: d('2026-10-27T12:00:00'),
  },
  {
    id: 'job_0131', code: 'Z-2026-0131', title: 'Revize a výměna rozvaděče', trade: 'electro', status: 'approved',
    client: { name: 'Pekárna U Mlýna', phone: '+420 566 301 744', address: 'Mlýnská 5, Žďár nad Sázavou', geo: null },
    assignedWorkerIds: ['u_dvorak'],
    schedule: { start: d('2026-10-06'), due: d('2026-10-10') },
    budget: { revenue: 78000, laborHours: 32, laborCost: 12200, materialCost: 31000 },
    actuals: { laborHours: 29, laborCost: 11000, materialCost: 29800, updatedAt: d('2026-10-10T14:00:00') },
    progressPct: 100,
    materialPlan: [
      { materialId: 'mat_rozv54', name: 'Rozvaděč 54 mod. IP65', unit: 'ks', unitCost: 6900, plannedQty: 1, usedQty: 1 },
      { materialId: 'mat_jistic3f', name: 'Jistič 3P C32', unit: 'ks', unitCost: 890, plannedQty: 6, usedQty: 6 },
    ],
    approval: { approvedBy: 'u_owner', approvedAt: d('2026-10-13T08:30:00') },
    createdAt: d('2026-09-25'), updatedAt: d('2026-10-13T08:30:00'),
  },
];


/** Katalog materiálu firmy (companies/{cid}/materials). Z něj se plánuje i vydává. */
/**
 * Ukázkové EAN-13 z rozsahu 200–299, který je vyhrazený pro interní kódy firmy,
 * takže se nekryje s žádným skutečným produktem.
 */
function ean13(n: number) {
  const base = `2000000${String(n).padStart(5, '0')}`;
  const sum = [...base].reduce((a, d, i) => a + Number(d) * (i % 2 ? 3 : 1), 0);
  return base + ((10 - (sum % 10)) % 10);
}
let seq = 0;
const m = (id: string, sku: string, name: string, category: string, unit: MaterialItem['unit'], unitCost: number, stockQty: number, supplier: string, reorderPoint = Math.round(stockQty * 0.25)): MaterialItem => ({
  id, sku, name, category, unit, unitCost, stockQty, reorderPoint, supplier, barcode: ean13(++seq),
});

export const mockMaterials: MaterialItem[] = [
  m('mat_cyky3x25', 'CYKY-3x2.5', 'Kabel CYKY-J 3×2,5', 'Elektro', 'm', 32, 850, 'Elfetex'),
  m('mat_cyky3x15', 'CYKY-3x1.5', 'Kabel CYKY-J 3×1,5', 'Elektro', 'm', 22, 1200, 'Elfetex'),
  m('mat_cyky5x25', 'CYKY-5x2.5', 'Kabel CYKY-J 5×2,5', 'Elektro', 'm', 54, 300, 'Elfetex'),
  m('mat_krabkp68', 'KP68', 'Krabice KP 68', 'Elektro', 'ks', 14, 400, 'Elfetex'),
  m('mat_jistic16b', 'B16-1P', 'Jistič 1P B16', 'Elektro', 'ks', 165, 60, 'Elfetex'),
  m('mat_jistic3f', 'C32-3P', 'Jistič 3P C32', 'Elektro', 'ks', 890, 12, 'Elfetex'),
  m('mat_chranic', 'OFI-40-4', 'Proudový chránič 40A/30mA 4P', 'Elektro', 'ks', 1290, 2, 'Elfetex', 4),
  m('mat_rozv36', 'RZ-36', 'Rozvodnice 36 mod.', 'Elektro', 'ks', 2890, 4, 'Elfetex'),
  m('mat_rozv54', 'RZ-54-IP65', 'Rozvaděč 54 mod. IP65', 'Elektro', 'ks', 6900, 2, 'Elfetex'),
  m('mat_zasuvka', 'ZAS-2P', 'Zásuvka dvojnásobná bílá', 'Elektro', 'ks', 129, 150, 'Elfetex'),
  m('mat_ppr32', 'PPR-32-20', 'Trubka PPR 32 PN20', 'Voda a topení', 'm', 118, 500, 'Ptáček'),
  m('mat_ppr25', 'PPR-25-20', 'Trubka PPR 25 PN20', 'Voda a topení', 'm', 74, 600, 'Ptáček'),
  m('mat_izol32', 'TUB-32-13', 'Izolace Tubolit 32/13', 'Voda a topení', 'm', 41, 400, 'Ptáček'),
  m('mat_ventil', 'KV-54', 'Kulový ventil 5/4"', 'Voda a topení', 'ks', 486, 6, 'Ptáček', 10),
  m('mat_koleno32', 'PPR-K32', 'Koleno PPR 32/90°', 'Voda a topení', 'ks', 19, 300, 'Ptáček'),
  m('mat_okno1215', 'OK-120150-3', 'Okno plast. 120×150, trojsklo', 'Okna', 'ks', 11800, 0, 'Oknoplast', 0),
  m('mat_pena', 'PU-750', 'PU pěna nízkoexp. 750 ml', 'Okna', 'ks', 189, 8, 'Oknoplast', 20),
  m('mat_paska', 'OP-VN', 'Okenní páska vnitřní', 'Okna', 'm', 26, 300, 'Oknoplast'),
  m('mat_obklad', 'OBK-3060', 'Obklad 30×60 rektif.', 'Stavba', 'm', 690, 60, 'Siko'),
  m('mat_lepidlo', 'C2TE-25', 'Flex. lepidlo C2TE', 'Stavba', 'bal', 345, 40, 'Siko'),
  m('mat_hydro', 'HS-5', 'Hydroizolační stěrka', 'Stavba', 'kg', 118, 50, 'Siko'),
  m('mat_sadrokarton', 'SDK-125', 'Sádrokarton 12,5 mm', 'Stavba', 'ks', 189, 120, 'Siko'),
  m('mat_tc9kw', 'TC-9', 'TČ split 9 kW', 'TČ', 'ks', 158000, 1, 'Daikin'),
  m('mat_cu', 'CU-38-58', 'Cu potrubí 3/8" + 5/8"', 'TČ', 'm', 410, 40, 'Daikin'),
];

/** Auta party (companies/{cid}/vans). */
export const mockVans: Van[] = [
  { id: 'van1', name: 'Transit', plate: '2ZR 4512', driverIds: ['u_dvorak', 'u_kral'] },
  { id: 'van2', name: 'Crafter', plate: '3J7 8830', driverIds: ['u_hajek', 'u_benes'] },
];

/** Počáteční naložení aut – převody z hlavního skladu. */
const load = (materialId: string, van: string, qty: number, i: number): StockMove[] => [
  { id: `sm_seed_${i}a`, materialId, location: 'warehouse', delta: -qty, kind: 'transfer', at: d('2026-10-26T06:30:00'), by: 'u_svoboda', ref: `tr_seed_${i}` },
  { id: `sm_seed_${i}b`, materialId, location: `van:${van}`, delta: qty, kind: 'transfer', at: d('2026-10-26T06:30:00'), by: 'u_svoboda', ref: `tr_seed_${i}` },
];
export const mockStockMoves: StockMove[] = [
  ...load('mat_cyky3x25', 'van1', 200, 1),
  ...load('mat_cyky3x15', 'van1', 150, 2),
  ...load('mat_krabkp68', 'van1', 60, 3),
  ...load('mat_jistic16b', 'van1', 12, 4),
  ...load('mat_zasuvka', 'van1', 20, 5),
  ...load('mat_ppr32', 'van2', 80, 6),
  ...load('mat_ppr25', 'van2', 80, 7),
  ...load('mat_koleno32', 'van2', 60, 8),
  ...load('mat_izol32', 'van2', 60, 9),
];

export const mockSuppliers: Supplier[] = [
  { name: 'Elfetex', email: '' },
  { name: 'Ptáček', email: '' },
  { name: 'Siko', email: '' },
  { name: 'Oknoplast', email: '' },
  { name: 'Daikin', email: '' },
];

export const mockTemplates: JobTemplate[] = [
  {
    id: 'tpl_byt31', name: 'Elektroinstalace bytu 3+1', trade: 'electro', title: 'Elektroinstalace bytu 3+1', revenue: 145000, laborHours: 120,
    materialLines: [
      { materialId: 'mat_cyky3x25', qty: 400 }, { materialId: 'mat_cyky3x15', qty: 350 }, { materialId: 'mat_krabkp68', qty: 60 },
      { materialId: 'mat_zasuvka', qty: 30 }, { materialId: 'mat_jistic16b', qty: 14 }, { materialId: 'mat_chranic', qty: 1 }, { materialId: 'mat_rozv36', qty: 1 },
    ],
    checklist: [
      { text: 'Změřit izolační odpor a zapsat hodnoty', required: true }, { text: 'Otestovat proudové chrániče', required: true },
      { text: 'Vyfotit rozvaděč s popisky jističů', required: true }, { text: 'Předat revizní zprávu', required: true }, { text: 'Uklidit pracoviště', required: false },
    ],
  },
  {
    id: 'tpl_okna8', name: 'Výměna oken RD (8 oken)', trade: 'windows', title: 'Výměna oken v rodinném domě', revenue: 172000, laborHours: 48,
    materialLines: [{ materialId: 'mat_okno1215', qty: 8 }, { materialId: 'mat_pena', qty: 20 }, { materialId: 'mat_paska', qty: 90 }],
    checklist: [
      { text: 'Seřídit kování všech oken', required: true }, { text: 'Zkontrolovat připojovací spáru a pásky', required: true },
      { text: 'Odvézt stará okna', required: true }, { text: 'Předat zákazníkovi návod k údržbě', required: false },
    ],
  },
  {
    id: 'tpl_koupelna', name: 'Koupelna kompletně', trade: 'construction', title: 'Rekonstrukce koupelny', revenue: 158000, laborHours: 112,
    materialLines: [{ materialId: 'mat_obklad', qty: 32 }, { materialId: 'mat_lepidlo', qty: 14 }, { materialId: 'mat_hydro', qty: 20 }, { materialId: 'mat_ppr25', qty: 25 }],
    checklist: [
      { text: 'Vyfotit rozvody před zakrytím', required: true }, { text: 'Vyfotit hydroizolaci před obkladem', required: true },
      { text: 'Tlaková zkouška potrubí', required: true }, { text: 'Zkontrolovat rovinnost a spárování', required: true },
    ],
  },
];

/** Zprávy k zakázkám (companies/{cid}/notes). */
export const mockNotes: JobNote[] = [
  { id: 'nt_seed1', jobId: 'job_0142', authorId: 'u_owner', text: 'Klíče od domu jsou u sousedky v čísle 12, paní Hrubá.', createdAt: d('2026-10-12T07:10:00') },
  { id: 'nt_seed2', jobId: 'job_0142', authorId: 'u_dvorak', text: 'V garáži chce zákazník zásuvky navíc, poslal jsem to jako vícepráci.', createdAt: d('2026-10-27T13:22:00') },
  { id: 'nt_seed3', jobId: 'job_0145', authorId: 'u_hajek', text: 'Ve 3. patře je rozvod jiný než ve výkresu, bude potřeba víc kolen.', createdAt: d('2026-10-24T10:05:00') },
];

/** Log čerpání materiálu – zobrazuje se v Draweru (Accordion po položkách). */
export const mockMaterialUsage: MaterialUsage[] = [
  { id: 'mu_1', jobId: 'job_0142', materialId: 'mat_cyky3x25', qty: 200, unitCostSnapshot: 32, workerId: 'u_dvorak', usedAt: d('2026-10-14T08:10:00'), source: 'mobile' },
  { id: 'mu_2', jobId: 'job_0142', materialId: 'mat_cyky3x25', qty: 150, unitCostSnapshot: 32, workerId: 'u_kral', usedAt: d('2026-10-20T07:40:00'), source: 'mobile' },
  { id: 'mu_3', jobId: 'job_0142', materialId: 'mat_cyky3x25', qty: 120, unitCostSnapshot: 32, workerId: 'u_dvorak', usedAt: d('2026-10-27T09:05:00'), source: 'mobile' },
  { id: 'mu_4', jobId: 'job_0142', materialId: 'mat_cyky3x15', qty: 380, unitCostSnapshot: 22, workerId: 'u_kral', usedAt: d('2026-10-16T10:30:00'), source: 'mobile' },
  { id: 'mu_5', jobId: 'job_0142', materialId: 'mat_krabkp68', qty: 61, unitCostSnapshot: 14, workerId: 'u_dvorak', usedAt: d('2026-10-15T13:00:00'), source: 'office' },
  { id: 'mu_6', jobId: 'job_0142', materialId: 'mat_jistic16b', qty: 10, unitCostSnapshot: 165, workerId: 'u_dvorak', usedAt: d('2026-10-27T14:20:00'), source: 'mobile' },
  { id: 'mu_7', jobId: 'job_0142', materialId: 'mat_rozv36', qty: 1, unitCostSnapshot: 2890, workerId: 'u_kral', usedAt: d('2026-10-13T11:00:00'), source: 'office' },
  { id: 'mu_8', jobId: 'job_0145', materialId: 'mat_ppr32', qty: 190, unitCostSnapshot: 118, workerId: 'u_hajek', usedAt: d('2026-10-21T08:00:00'), source: 'mobile' },
  { id: 'mu_9', jobId: 'job_0145', materialId: 'mat_ppr25', qty: 140, unitCostSnapshot: 74, workerId: 'u_benes', usedAt: d('2026-10-22T09:15:00'), source: 'mobile' },
  { id: 'mu_10', jobId: 'job_0145', materialId: 'mat_izol32', qty: 160, unitCostSnapshot: 41, workerId: 'u_benes', usedAt: d('2026-10-23T12:40:00'), source: 'mobile' },
  { id: 'mu_11', jobId: 'job_0145', materialId: 'mat_ventil', qty: 14, unitCostSnapshot: 486, workerId: 'u_hajek', usedAt: d('2026-10-26T15:10:00'), source: 'mobile' },
  { id: 'mu_12', jobId: 'job_0139', materialId: 'mat_okno1215', qty: 12, unitCostSnapshot: 11800, workerId: 'u_svoboda', usedAt: d('2026-10-06T07:30:00'), source: 'office' },
  { id: 'mu_13', jobId: 'job_0139', materialId: 'mat_pena', qty: 34, unitCostSnapshot: 189, workerId: 'u_benes', usedAt: d('2026-10-15T10:00:00'), source: 'mobile' },
  { id: 'mu_14', jobId: 'job_0139', materialId: 'mat_paska', qty: 152, unitCostSnapshot: 26, workerId: 'u_benes', usedAt: d('2026-10-16T11:30:00'), source: 'mobile' },
  { id: 'mu_15', jobId: 'job_0137', materialId: 'mat_obklad', qty: 36, unitCostSnapshot: 690, workerId: 'u_hajek', usedAt: d('2026-10-08T08:00:00'), source: 'office' },
  { id: 'mu_16', jobId: 'job_0137', materialId: 'mat_lepidlo', qty: 18, unitCostSnapshot: 345, workerId: 'u_kral', usedAt: d('2026-10-09T09:00:00'), source: 'mobile' },
  { id: 'mu_17', jobId: 'job_0137', materialId: 'mat_hydro', qty: 24, unitCostSnapshot: 118, workerId: 'u_kral', usedAt: d('2026-10-07T13:30:00'), source: 'mobile' },
];

/** stats/w-2026-XX – 12 týdnů předagregovaných Cloud Function. */
const weekly: Array<[number, number, number, number, number]> = [
  // [týden, tržby, práce, materiál, hodiny]
  [32, 248000, 71000, 98000, 186],
  [33, 231000, 69500, 94000, 181],
  [34, 262000, 74200, 105000, 194],
  [35, 289000, 80100, 118000, 210],
  [36, 274000, 78800, 121000, 205],
  [37, 301000, 83400, 126000, 218],
  [38, 296000, 86900, 131000, 226],
  [39, 318000, 88100, 129000, 229],
  [40, 284000, 90300, 127000, 235],
  [41, 309000, 92700, 133000, 241],
  [42, 327000, 95100, 141000, 247],
  [43, 315000, 97800, 146000, 254],
];

export const mockWeeklyStats: PeriodStat[] = weekly.map(([w, revenue, laborCost, materialCost, hours]) => ({
  id: `w-2026-${w}`,
  granularity: 'week',
  periodStart: new Date(2026, 0, 1 + (w - 1) * 7),
  label: `${w}. t.`,
  revenue,
  laborCost,
  materialCost,
  hours,
  jobsCompleted: Math.round(hours / 60),
}));

/* ---------- fáze 3: peníze ---------- */

/** Nastavení ukázkové firmy. IČO a DIČ jsou prázdné – doplní je majitel v Nastavení. */
export const mockSettings: CompanySettings = {
  name: MOCK_COMPANY.name,
  ico: '',
  dic: '',
  address: MOCK_COMPANY.address,
  phone: MOCK_COMPANY.phone,
  email: '',
  bankAccount: '',
  logo: null,
  vatPayer: true,
  defaultVatMode: 'reduced12',
  billRate: 650,
  materialMarkup: 1.15,
  paymentDueDays: 14,
  quoteValidityDays: 30,
  overheadItems: [
    { id: 'oh1', label: 'Auta (leasing, PHM, pojištění)', monthly: 38000 },
    { id: 'oh2', label: 'Sklad a kancelář', monthly: 15000 },
    { id: 'oh3', label: 'Nářadí a opravy', monthly: 8000 },
    { id: 'oh4', label: 'Účetní', monthly: 6000 },
    { id: 'oh5', label: 'Telefony a software', monthly: 4500 },
    { id: 'oh6', label: 'Pojištění odpovědnosti', monthly: 2500 },
  ],
  capacityHours: 600,
};

export const mockQuotes: Quote[] = [
  {
    id: 'q_seed1', number: 'NAB-2026-0012', status: 'sent', title: 'Elektroinstalace bytu 3+1', trade: 'electro', vatMode: 'reduced12',
    client: { name: 'Jana Svobodová', phone: '+420 731 555 210', email: '', address: 'Okružní 8, Žďár nad Sázavou', ico: '' },
    items: [
      { id: 'qi1', kind: 'labor', text: 'Montáž elektroinstalace, rozvody a přístroje', qty: 110, unit: 'h', unitPrice: 650 },
      { id: 'qi2', kind: 'material', text: 'Kabel CYKY-J 3×2,5', qty: 400, unit: 'm', unitPrice: 37, materialId: 'mat_cyky3x25' },
      { id: 'qi3', kind: 'material', text: 'Kabel CYKY-J 3×1,5', qty: 350, unit: 'm', unitPrice: 25, materialId: 'mat_cyky3x15' },
      { id: 'qi4', kind: 'material', text: 'Zásuvka dvojnásobná bílá', qty: 30, unit: 'ks', unitPrice: 148, materialId: 'mat_zasuvka' },
      { id: 'qi5', kind: 'material', text: 'Rozvodnice 36 mod.', qty: 1, unit: 'ks', unitPrice: 3324, materialId: 'mat_rozv36' },
      { id: 'qi6', kind: 'other', text: 'Výchozí revize elektroinstalace', qty: 1, unit: 'kpl', unitPrice: 4500 },
    ],
    note: 'Cena nezahrnuje svítidla a zednické začištění drážek.',
    validUntil: d('2026-11-20'), templateId: 'tpl_byt31', createdAt: d('2026-10-21T10:00:00'), sentAt: d('2026-10-21T10:30:00'), decidedAt: null, jobId: null,
  },
  {
    id: 'q_seed2', number: 'NAB-2026-0013', status: 'draft', title: 'Výměna 5 oken v přízemí', trade: 'windows', vatMode: 'reduced12',
    client: { name: 'Tomáš Kříž', phone: '+420 604 330 118', email: '', address: 'Zahradní 41, Nové Město na Moravě', ico: '' },
    items: [
      { id: 'qi7', kind: 'labor', text: 'Demontáž a montáž oken včetně zapravení', qty: 30, unit: 'h', unitPrice: 650 },
      { id: 'qi8', kind: 'material', text: 'Okno plast. 120×150, trojsklo', qty: 5, unit: 'ks', unitPrice: 13570, materialId: 'mat_okno1215' },
      { id: 'qi9', kind: 'material', text: 'PU pěna nízkoexp. 750 ml', qty: 12, unit: 'ks', unitPrice: 217, materialId: 'mat_pena' },
      { id: 'qi10', kind: 'other', text: 'Odvoz a likvidace starých oken', qty: 1, unit: 'kpl', unitPrice: 1800 },
    ],
    note: '',
    validUntil: d('2026-11-28'), templateId: null, createdAt: d('2026-10-28T15:00:00'), sentAt: null, decidedAt: null, jobId: null,
  },
];

/**
 * Ukázkové docházky za aktuální měsíc (pracovní dny před dneškem), aby mzdové podklady
 * nebyly prázdné. Generují se relativně k dnešku.
 */
function seedTimeLogs(): { logs: TimeLog[]; confirmed: Record<string, Date> } {
  const crews: Array<[string, string, number]> = [
    ['u_dvorak', 'job_0142', 380], ['u_kral', 'job_0142', 360], ['u_hajek', 'job_0145', 420], ['u_benes', 'job_0145', 340], ['u_svoboda', 'job_0139', 450],
  ];
  const logs: TimeLog[] = [];
  const confirmed: Record<string, Date> = {};
  const today = new Date();
  for (let day = 1; day < today.getDate(); day++) {
    const date = new Date(today.getFullYear(), today.getMonth(), day);
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    crews.forEach(([uid, jobId, cost], i) => {
      if ((day + i) % 9 === 0) return; // občas volno
      const start = new Date(date); start.setHours(7, 0 + i * 5, 0, 0);
      const minutes = 450 + ((day * 7 + i * 11) % 60); // 7,5–8,5 h
      const end = new Date(start.getTime() + (minutes + 30) * 60_000);
      logs.push({ id: `tl_seed_${uid}_${day}`, jobId, workerId: uid, startedAt: start, endedAt: end, durationMin: minutes, costSnapshot: Math.round((minutes / 60) * cost), geoStart: null, breakMin: 30 });
      if (today.getDate() - day > 2) confirmed[`${uid}_${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`] = end;
    });
  }
  return { logs, confirmed };
}
const seeded = seedTimeLogs();
export const mockTimeLogs = seeded.logs;
export const mockDayReports = seeded.confirmed;

/* ---------- fáze 4: historie dokončených zakázek pro analytiku ---------- */

/** Deterministický generátor náhodných čísel – historie je při každém načtení stejná. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HISTORY_TITLES: Record<Job['trade'], string[]> = {
  electro: ['Elektroinstalace bytu 2+1', 'Výměna rozvaděče v RD', 'Elektro v garáži a dílně', 'Nové rozvody v kuchyni', 'Hromosvod a uzemnění'],
  plumbing: ['Rozvody vody v koupelně', 'Výměna kotle a rozvodů', 'Kanalizační přípojka', 'Podlahové topení v přízemí'],
  windows: ['Výměna oken v bytě', 'Vchodové dveře a okna', 'Okna v podkroví', 'Výměna balkonových dveří'],
  construction: ['Rekonstrukce koupelny', 'Přestavba kuchyně', 'Sádrokartonové podhledy', 'Obklady a dlažby WC'],
  hvac: ['Klimatizace do ložnic', 'Tepelné čerpadlo 7 kW', 'Rekuperace v RD'],
};

/** Jak moc se v oboru přetahují hodiny proti plánu (1 = přesně podle plánu). */
const TRADE_OVERRUN: Record<Job['trade'], number> = { electro: 1.04, plumbing: 1.16, windows: 0.96, construction: 1.22, hvac: 1.02 };
/** Výkon party (>1 = rychlejší než průměr). */
const CREWS: Array<{ ids: string[]; speed: number; trades: Job['trade'][] }> = [
  { ids: ['u_dvorak', 'u_kral'], speed: 1.06, trades: ['electro', 'electro', 'hvac'] },
  { ids: ['u_hajek', 'u_benes'], speed: 0.88, trades: ['plumbing', 'construction', 'plumbing'] },
  { ids: ['u_svoboda', 'u_benes'], speed: 0.98, trades: ['windows', 'construction'] },
  { ids: ['u_dvorak'], speed: 1.02, trades: ['electro'] },
  { ids: ['u_hajek', 'u_kral'], speed: 0.95, trades: ['hvac', 'plumbing'] },
];
const CLIENTS = ['Rodina Novotných', 'Ing. Pavel Dušek', 'SVJ Zahradní 12', 'Marie Veselá', 'Pekárna U Mlýna', 'Obec Jámy', 'Petr a Eva Horákovi', 'Autoservis Kubát', 'Mgr. Lenka Malá', 'Bytové družstvo Vysočina'];
const TOWNS = ['Žďár nad Sázavou', 'Nové Město na Moravě', 'Bystřice nad Pernštejnem', 'Velké Meziříčí', 'Svratka'];

function historyJobs(): Job[] {
  const r = rng(20261030);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const between = (a: number, b: number) => a + r() * (b - a);
  const now = Date.now();
  const day = 86_400_000;
  const out: Job[] = [];
  for (let i = 0; i < 30; i++) {
    const crew = pick(CREWS);
    const trade = pick(crew.trades);
    const budgetHours = Math.round(between(24, 150));
    const rate = crew.ids.length === 1 ? 380 : 370;
    const materialBudget = Math.round(budgetHours * between(250, 900));
    const revenue = Math.round((budgetHours * 650 + materialBudget * 1.15) * between(1.0, 1.12) / 100) * 100;
    const actualHours = Math.round(budgetHours * (TRADE_OVERRUN[trade] / crew.speed) * between(0.9, 1.12));
    const materialFactor = trade === 'construction' ? between(1.0, 1.2) : between(0.94, 1.1);
    const actualMaterial = Math.round(materialBudget * materialFactor);
    const start = new Date(now - between(25, 185) * day);
    start.setHours(7, 0, 0, 0);
    const plannedDays = Math.max(3, Math.round(budgetHours / (8 * crew.ids.length)) + 2);
    const due = new Date(start.getTime() + plannedDays * day);
    const finished = new Date(due.getTime() + Math.round((actualHours / budgetHours - 1) * plannedDays + between(-2, 2)) * day);
    const handoverAt = new Date(Math.min(now - 3 * day, finished.getTime()));
    const issuedAt = new Date(handoverAt.getTime() + 2 * day);
    const dueDate = new Date(issuedAt.getTime() + 14 * day);
    const vatMode: Job['vatMode'] = r() < 0.75 ? 'reduced12' : 'standard21';
    const gross = Math.round(revenue * (vatMode === 'reduced12' ? 1.12 : 1.21));
    const unpaid = dueDate.getTime() > now - 5 * day && r() < 0.6;
    const catalogLine = (id: string, share: number) => {
      const c = mockMaterials.find((x) => x.id === id)!;
      const planned = Math.max(1, Math.round((materialBudget * share) / c.unitCost));
      return { materialId: c.id, name: c.name, unit: c.unit, unitCost: c.unitCost, plannedQty: planned, usedQty: Math.round(planned * materialFactor) };
    };
    const lines: Record<Job['trade'], [string, string]> = {
      electro: ['mat_cyky3x25', 'mat_jistic16b'],
      plumbing: ['mat_ppr32', 'mat_ventil'],
      windows: ['mat_okno1215', 'mat_pena'],
      construction: ['mat_obklad', 'mat_lepidlo'],
      hvac: ['mat_cu', 'mat_izol32'],
    };
    const code = `Z-2026-${String(80 + i).padStart(4, '0')}`;
    out.push({
      id: `job_h${i}`,
      code,
      title: pick(HISTORY_TITLES[trade]),
      trade,
      status: 'invoiced',
      client: { name: pick(CLIENTS), phone: '', address: `${pick(['Polní', 'Lesní', 'Nádražní', 'Školní', 'Krátká'])} ${Math.ceil(r() * 60)}, ${pick(TOWNS)}`, geo: null },
      assignedWorkerIds: crew.ids,
      schedule: { start, due },
      budget: { revenue, laborHours: budgetHours, laborCost: Math.round(budgetHours * rate), materialCost: materialBudget },
      actuals: { laborHours: actualHours, laborCost: Math.round(actualHours * rate), materialCost: actualMaterial, updatedAt: handoverAt },
      progressPct: 100,
      materialPlan: [catalogLine(lines[trade][0], 0.7), catalogLine(lines[trade][1], 0.3)],
      checklist: [],
      extraWork: [],
      handover: { clientName: 'zákazník', signature: null, signedAt: handoverAt, workerId: crew.ids[0] },
      vatMode,
      payments: [
        {
          id: `pay_h${i}`,
          label: 'Úhrada faktury',
          amount: gross,
          dueDate,
          issuedAt,
          paidAt: unpaid ? null : new Date(dueDate.getTime() + Math.round(between(-6, 9)) * day),
        },
      ],
      invoice: { number: `PF-${start.getFullYear()}-${String(i + 1).padStart(4, '0')}`, issuedAt, taxDate: handoverAt, dueDate },
      approval: { approvedBy: 'u_owner', approvedAt: new Date(handoverAt.getTime() + day) },
      createdAt: new Date(start.getTime() - 10 * day),
      updatedAt: issuedAt,
    });
  }
  return out;
}

export const mockHistoryJobs = historyJobs();

/* ---------- fáze 5: provoz ---------- */

export const mockCertificates: Certificate[] = [
  { id: 'cert1', uid: 'u_dvorak', kind: 'vyhl50', label: '§ 6 vyhl. 50/1978', number: 'E-2231/19', validUntil: d('2027-06-30') },
  { id: 'cert2', uid: 'u_kral', kind: 'vyhl50', label: '§ 6 vyhl. 50/1978', number: 'E-4410/20', validUntil: new Date(Date.now() + 18 * 86_400_000) },
  { id: 'cert3', uid: 'u_svoboda', kind: 'vyhl50', label: '§ 7 vyhl. 50/1978', number: 'E-1022/15', validUntil: d('2028-03-31') },
  { id: 'cert4', uid: 'u_svoboda', kind: 'fgas', label: 'Certifikát F-plyny kat. I', number: 'F-88213', validUntil: d('2029-01-15') },
  { id: 'cert5', uid: 'u_hajek', kind: 'welding', label: 'Svářečský průkaz ZK 135', number: 'SV-55120', validUntil: d('2027-02-28') },
  { id: 'cert6', uid: 'u_benes', kind: 'heights', label: 'Práce ve výškách', number: '', validUntil: d('2026-09-30') },
  { id: 'cert7', uid: 'u_dvorak', kind: 'bozp', label: 'Školení BOZP', number: '', validUntil: d('2027-01-31') },
  { id: 'cert8', uid: 'u_kral', kind: 'bozp', label: 'Školení BOZP', number: '', validUntil: d('2027-01-31') },
  { id: 'cert9', uid: 'u_hajek', kind: 'bozp', label: 'Školení BOZP', number: '', validUntil: new Date(Date.now() + 9 * 86_400_000) },
  { id: 'cert10', uid: 'u_benes', kind: 'bozp', label: 'Školení BOZP', number: '', validUntil: d('2027-01-31') },
  { id: 'cert11', uid: 'u_svoboda', kind: 'bozp', label: 'Školení BOZP', number: '', validUntil: d('2027-01-31') },
];

export const mockRecurring: RecurringPlan[] = [
  {
    id: 'rec1', title: 'Servis klimatizace', trade: 'hvac', clientName: 'Autoservis Kubát', clientPhone: '+420 566 620 911', address: 'Brněnská 44, Žďár nad Sázavou',
    intervalMonths: 12, nextDate: new Date(Date.now() + 6 * 86_400_000), revenue: 4800, laborHours: 4, assignedWorkerIds: ['u_svoboda'], templateId: null, active: true, lastJobId: null,
  },
  {
    id: 'rec2', title: 'Pravidelná revize elektroinstalace', trade: 'electro', clientName: 'Pekárna U Mlýna', clientPhone: '+420 566 301 744', address: 'Mlýnská 5, Žďár nad Sázavou',
    intervalMonths: 36, nextDate: new Date(Date.now() + 40 * 86_400_000), revenue: 9500, laborHours: 10, assignedWorkerIds: ['u_svoboda', 'u_dvorak'], templateId: null, active: true, lastJobId: null,
  },
  {
    id: 'rec3', title: 'Servis tepelného čerpadla', trade: 'hvac', clientName: 'Rodina Pokorných', clientPhone: '+420 739 450 118', address: 'Za Humny 22, Velké Meziříčí',
    intervalMonths: 12, nextDate: d('2027-11-14'), revenue: 3900, laborHours: 3, assignedWorkerIds: ['u_svoboda'], templateId: null, active: true, lastJobId: null,
  },
];

/** Ruční zápisy do stavebního deníku (ostatní záznamy deník skládá z docházky, materiálu, fotek…). */
export const mockAudit: AuditEntry[] = [
  { id: 'au_s1', jobId: 'job_0142', at: d('2026-10-12T07:10:00'), by: 'u_svoboda', kind: 'diary', text: 'Převzetí staveniště od zákazníka, přípojka elektro odpojena distributorem.' },
  { id: 'au_s2', jobId: 'job_0142', at: d('2026-10-20T15:30:00'), by: 'u_dvorak', kind: 'diary', text: 'Drážky ve 2. NP hotové, zedník začistí do čtvrtka.' },
  { id: 'au_s3', jobId: 'job_0145', at: d('2026-10-24T10:10:00'), by: 'u_hajek', kind: 'diary', text: 'Ve 3. patře jiný rozvod než ve výkresu, upraveno po dohodě s předsedou SVJ.' },
];
