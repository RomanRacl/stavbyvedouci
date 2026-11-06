/**
 * Automatické testy celé aplikace v prohlížeči (Playwright, Chromium).
 *
 *   npm run e2e                      – proti http://localhost:3000 (nejdřív `npm run build && npm start`)
 *   BASE_URL=https://… npm run e2e   – proti nasazené verzi
 *
 * Každý test běží v čistém prohlížeči (prázdné úložiště = ukázková data).
 * Bez frameworku: stačí balíček `playwright`, výsledek je čitelný i v GitHub Actions.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
/** Náhled v jednom HTML souboru používá adresy za # (E2E_HASH=1). */
const HASH = process.env.E2E_HASH === '1';
const ONLY = process.env.E2E_ONLY ?? '';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const A11Y = readFileSync(path.join(HERE, 'a11y.js'), 'utf8');

const url = (p) => (HASH ? `${BASE}#${p}` : `${BASE}${p}`);
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

class Fail extends Error {}
const expect = (cond, msg) => {
  if (!cond) throw new Fail(msg);
};

/** Počká, až se na stránce objeví text (nebo vyprší limit). */
async function seeText(page, text, timeout = 8000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });
}
/** Opakuje kontrolu, dokud neplatí (UI se dokreslí asynchronně). */
async function eventually(fn, msg, timeout = 4000) {
  const end = Date.now() + timeout;
  for (;;) {
    if (await fn()) return;
    if (Date.now() > end) throw new Fail(msg);
    await new Promise((r) => setTimeout(r, 100));
  }
}
async function go(page, p) {
  await page.goto(url(p));
  await page.waitForLoadState('domcontentloaded');
}

/* ---------- kancelář ---------- */

test('přehled zakázek se načte s ukázkovými daty', async (page) => {
  await go(page, '/dashboard');
  await seeText(page, 'Přehled zakázek');
  await seeText(page, 'Z-2026-0142');
});

test('detail zakázky: záložky a rozbor ztráty', async (page) => {
  await go(page, '/dashboard?job=job_0145');
  await seeText(page, 'Výměna stoupaček');
  await page.getByText('Proč? Rozbor podle příčin').click();
  await seeText(page, 'Subdodávky');
  await page.getByRole('tab', { name: /^Peníze/ }).first().click();
  await seeText(page, 'Zálohy a platby');
});

test('založení nové zakázky', async (page) => {
  await go(page, '/dashboard');
  await page.getByRole('button', { name: 'Nová zakázka' }).click();
  await page.getByLabel('Název zakázky').fill('E2E test: rozvaděč');
  await page.getByLabel('Jméno nebo firma').fill('Testovací zákazník');
  await page.getByLabel('Adresa zakázky').fill('Testovací 1, Brno');
  await page.getByLabel('Cena pro zákazníka bez DPH (Kč)').fill('25000');
  await page.getByLabel('Hodiny práce').fill('16');
  await page.getByRole('button', { name: 'Založit zakázku' }).click();
  await seeText(page, 'E2E test: rozvaděč');
});

test('hromadné schválení zakázek', async (page) => {
  await go(page, '/dashboard');
  await page.getByRole('button', { name: 'Hromadný výběr' }).click();
  await page.getByRole('tab', { name: /^Ke schválení/ }).click();
  await page.getByText(/^vše \(/).click();
  await page.getByRole('button', { name: 'Schválit' }).click();
  await seeText(page, 'Schváleno 2 zakázek');
});

test('nabídka: upozornění na zdražení a přepočet', async (page) => {
  await go(page, '/nabidky');
  await seeText(page, 'Dodavatelé zdražili');
  await page.getByRole('button', { name: 'Přepočítat ceny' }).first().click();
  await seeText(page, 'přepočítány');
});

test('pohledávky: text upomínky', async (page) => {
  await go(page, '/penize');
  await page.getByRole('tab', { name: 'Pohledávky a upomínky' }).click();
  await page.getByRole('button', { name: /upomínka$/ }).first().click();
  await seeText(page, /Připomenutí platby|Upomínka/);
  await page.getByRole('button', { name: 'Odesláno, zapsat' }).click();
  await seeText(page, 'upomínka k');
});

test('QR platba na podkladu k fakturaci', async (page) => {
  await go(page, '/tisk/podklad/job_h4');
  await seeText(page, 'QR Platba');
  expect(await page.locator('svg[aria-label^="QR platba"]').count() === 1, 'chybí QR kód');
});

test('obchod: poptávka → nabídka', async (page) => {
  await go(page, '/obchod');
  await page.getByRole('button', { name: 'Nová poptávka' }).click();
  await page.getByRole('textbox', { name: 'Zákazník' }).fill('E2E Klient');
  await page.getByRole('textbox', { name: 'Co poptává' }).fill('Montáž krbu');
  await page.getByRole('button', { name: 'Připravit nabídku' }).click();
  await seeText(page, 'Nová nabídka');
  await eventually(async () => (await page.getByRole('combobox', { name: 'Jméno nebo firma' }).inputValue()) === 'E2E Klient', 'nabídka není předvyplněná');
});

test('provoz: zápis jízdy', async (page) => {
  await go(page, '/provoz');
  await page.getByRole('button', { name: 'Zapsat jízdu' }).click();
  const start = Number(await page.getByLabel('Tachometr od').inputValue());
  await page.getByLabel('Tachometr do').fill(String(start + 37));
  await page.getByRole('button', { name: 'Uložit jízdu' }).click();
  await seeText(page, 'Jízda 37 km zapsána');
});

test('kalendář: Ganttův diagram', async (page) => {
  await go(page, '/kalendar');
  await page.getByRole('radio', { name: 'Gantt' }).click();
  await seeText(page, 'Svislá čára = dnes');
});

test('menu: boční lišta na počítači, výsuvné menu na tabletu', async (page) => {
  await go(page, '/dashboard');
  const nav = page.getByRole('navigation', { name: 'Hlavní navigace' });
  await nav.getByRole('link', { name: /Sklad/ }).click();
  await eventually(async () => page.url().includes('/sklad'), 'odkaz v boční liště nepřešel na sklad');
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByRole('button', { name: 'Otevřít menu' }).click();
  await page.getByRole('link', { name: /Kalendář/ }).click();
  await eventually(async () => page.url().includes('/kalendar'), 'mobilní menu nepřešlo na kalendář');
  await eventually(async () => (await page.locator('#mobile-menu').count()) === 0, 'menu se po přechodu nezavřelo');
});

test('tým: docházka dnes s polohou', async (page) => {
  await go(page, '/tym');
  await seeText(page, 'Docházka dnes');
  await seeText(page, 'na stavbě');
});

test('analytika: cíle a co kdyby', async (page) => {
  await go(page, '/analytika');
  await seeText(page, 'Cíle');
  await seeText(page, 'Co kdyby');
});

test('rychlé hledání: Ctrl+K najde zakázku podle adresy bez diakritiky', async (page) => {
  await go(page, '/dashboard');
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Hledat' }).fill('zdar lesni');
  await page.keyboard.press('Enter');
  await eventually(async () => page.url().includes('job=job_0142'), 'hledání neotevřelo zakázku');
});

test('upozornění: zvoneček vede na pohledávky', async (page) => {
  await go(page, '/dashboard');
  await page.getByRole('button', { name: /^Upozornění/ }).first().click();
  await page.getByRole('dialog').getByRole('link', { name: /po splatnosti/ }).first().click();
  await eventually(async () => (await page.getByRole('tab', { name: 'Pohledávky a upomínky' }).getAttribute('aria-selected')) === 'true', 'nepřepnulo na záložku pohledávek');
});

test('začít naostro: průvodce smaže ukázku a nový člověk je v mobilu', async (page) => {
  await go(page, '/zacit');
  await page.getByLabel('Název firmy *').fill('Elektro Test s.r.o.');
  await page.getByRole('button', { name: 'Pokračovat' }).click();
  await page.getByRole('button', { name: 'Pokračovat' }).click();
  await page.getByLabel('Vaše jméno *').fill('Majitel Testovací');
  await page.getByLabel('Jméno', { exact: true }).first().fill('Karel Nový');
  await page.getByRole('button', { name: 'Pokračovat' }).click();
  await page.getByLabel('Potvrzení: napište NAOSTRO').fill('NAOSTRO');
  await page.getByRole('button', { name: 'Začít naostro' }).click();
  await seeText(page, 'Hotovo, firma jede naostro');
  await seeText(page, 'Elektro Test s.r.o.');
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, '/w');
  await seeText(page, 'Karel Nový');
  expect((await page.getByText('Jan Dvořák').count()) === 0, 'ukázkový dělník zůstal v mobilu');
});

/* ---------- mobil party ---------- */

test('mobil: start a konec práce', async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, '/w');
  await page.getByText('Martin Král').click();
  await seeText(page, 'Moje zakázky');
  // Král má běžící měření z ukázkových dat – ukončíme ho a začneme znovu.
  await page.getByRole('button', { name: 'Ukončit' }).first().click();
  await seeText(page, 'Zapsáno');
  await page.getByRole('button', { name: 'Začít práci' }).first().click();
  await seeText(page, 'Měřím čas');
});

test('mobil: poloha při začátku, poloha stavby a bez signálu', async (page) => {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 49.59, longitude: 16.0 });
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, '/w');
  await page.getByText('Ondřej Svoboda').click();
  await page.locator('main li button').filter({ hasText: 'Z-2026-0148' }).first().click();
  await page.getByRole('button', { name: 'Jsem na stavbě – uložit její polohu' }).click();
  await seeText(page, 'Poloha stavby uložena');
  // Další den začne práci 3 km od stavby → upozornění.
  await page.context().setGeolocation({ latitude: 49.62, longitude: 16.0 });
  await page.locator('main.fixed').getByRole('button', { name: /Začít práci/ }).first().click();
  const safety = page.getByRole('button', { name: 'Byl(a) jsem poučen(a), začít práci' });
  if (await safety.count()) await safety.click();
  await seeText(page, 'od stavby');
  await page.context().setOffline(true);
  await seeText(page, 'Jste bez signálu');
  await page.context().setOffline(false);
  await seeText(page, 'Signál je zpět');
});

test('mobil: angličtina a ukrajinština', async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, '/w');
  await page.getByRole('radio', { name: 'English' }).click();
  await seeText(page, 'Who are you?');
  await page.getByText('Jan Dvořák').click();
  await seeText(page, 'My jobs');
  await page.getByRole('radio', { name: 'Українська' }).click();
  await seeText(page, 'Мої замовлення');
});

test('mobil: žádost o volno dorazí do kanceláře', async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, '/w');
  await page.getByText('Jan Dvořák').click();
  await page.getByRole('button', { name: /Volno a nemoc/ }).click();
  await page.getByRole('button', { name: /^Požádat o/ }).click();
  await seeText(page, 'Žádost odeslána');
  await page.setViewportSize({ width: 1280, height: 900 });
  await go(page, '/provoz');
  await page.getByRole('tab', { name: /^Dovolená a nemoc/ }).click();
  await seeText(page, 'Jan Dvořák');
});

/* ---------- přístupnost ---------- */

for (const p of ['/dashboard', '/obchod', '/penize', '/provoz', '/nastaveni']) {
  test(`přístupnost ${p}: tlačítka a pole mají popisky`, async (page) => {
    await go(page, p);
    await page.waitForTimeout(600);
    const issues = (await page.evaluate(A11Y)).filter(([kind]) => !kind.startsWith('kontrast'));
    expect(issues.length === 0, issues.map((i) => i.join(': ')).join('\n'));
  });
}

/* ---------- spuštění ---------- */

const browser = await chromium.launch();
let failed = 0;
const started = Date.now();
for (const t of tests.filter((x) => !ONLY || x.name.includes(ONLY))) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const t0 = Date.now();
  try {
    await t.fn(page);
    expect(errors.length === 0, `chyba v prohlížeči: ${errors.join('; ')}`);
    console.log(`  ✓ ${t.name} (${Date.now() - t0} ms)`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${t.name}\n      ${String(e.message ?? e).split('\n').slice(0, 6).join('\n      ')}`);
    await page.screenshot({ path: path.join(HERE, `fail-${t.name.replace(/[^\w]+/g, '-').slice(0, 40)}.png`) }).catch(() => undefined);
  }
  await ctx.close();
}
await browser.close();
const total = tests.filter((x) => !ONLY || x.name.includes(ONLY)).length;
console.log(`\n${total - failed}/${total} testů prošlo za ${Math.round((Date.now() - started) / 1000)} s`);
process.exit(failed ? 1 : 0);
