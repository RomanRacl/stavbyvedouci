import type { Job, Member, MaterialUsage, PeriodStat } from '@/types/firestore';

/** Mock data 1:1 podle schématu Firestore (po konvertoru Timestamp -> Date). */

const d = (iso: string) => new Date(iso);

export const MOCK_COMPANY_ID = 'cmp_novak_stavby';

export const mockMembers: Member[] = [
  { uid: 'u_owner', displayName: 'Petr Novák', initials: 'PN', role: 'owner', phone: '+420 602 111 222', hourlyCost: 0, active: true, activeTimer: null },
  { uid: 'u_dvorak', displayName: 'Jan Dvořák', initials: 'JD', role: 'worker', phone: '+420 603 445 120', hourlyCost: 380, active: true, activeTimer: { logId: 'tl_901', jobId: 'job_0142', startedAt: d('2026-10-28T07:05:00') } },
  { uid: 'u_kral', displayName: 'Martin Král', initials: 'MK', role: 'worker', phone: '+420 731 202 334', hourlyCost: 360, active: true, activeTimer: { logId: 'tl_902', jobId: 'job_0142', startedAt: d('2026-10-28T07:12:00') } },
  { uid: 'u_hajek', displayName: 'Tomáš Hájek', initials: 'TH', role: 'worker', phone: '+420 724 889 010', hourlyCost: 420, active: true, activeTimer: { logId: 'tl_903', jobId: 'job_0145', startedAt: d('2026-10-28T06:50:00') } },
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
    materialPlan: [
      { materialId: 'mat_cyky3x25', name: 'Kabel CYKY-J 3×2,5', unit: 'm', unitCost: 32, plannedQty: 600, usedQty: 470 },
      { materialId: 'mat_cyky3x15', name: 'Kabel CYKY-J 3×1,5', unit: 'm', unitCost: 22, plannedQty: 450, usedQty: 380 },
      { materialId: 'mat_krabkp68', name: 'Krabice KP 68', unit: 'ks', unitCost: 14, plannedQty: 80, usedQty: 61 },
      { materialId: 'mat_jistic16b', name: 'Jistič 1P B16', unit: 'ks', unitCost: 165, plannedQty: 24, usedQty: 10 },
      { materialId: 'mat_rozv36', name: 'Rozvodnice 36 mod.', unit: 'ks', unitCost: 2890, plannedQty: 1, usedQty: 1 },
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
