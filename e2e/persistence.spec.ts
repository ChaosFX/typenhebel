import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { makeEpub } from '../tests/fixtures/make-epub';
import { asTyped, sectionText, seedSettings } from './helpers';

test.beforeEach(async ({ page }) => {
  await seedSettings(page, { strict: true, sound: false, theme: 'light' });
});

async function importEpub(page: Page): Promise<void> {
  await page.locator('#loadBtn').click();
  await page
    .locator('#ldFile')
    .setInputFiles({ name: 'testbuch.epub', mimeType: 'application/epub+zip', buffer: Buffer.from(makeEpub()) });
  await expect(page.locator('#ldInfo')).toBeVisible();
  await page.locator('#ldGo').click();
  await expect(page.locator('#bookTitle')).toHaveText('Testbuch');
}

async function typeSection(page: Page): Promise<void> {
  await page.keyboard.type(asTyped(await sectionText(page)));
  await expect(page.locator('#resultVeil')).toBeVisible();
}

/** Daten im Format von Phase 0/1 in localStorage legen (nur beim ersten Laden). */
async function seedLegacy(page: Page, sessions: number): Promise<void> {
  await page.addInitScript((n) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const P = 'typenhebel.v1.';
    const book = {
      id: 'bold',
      title: 'Altes Buch',
      author: 'Jemand',
      sections: [
        { text: 'Erster alter Abschnitt.', breaks: [] },
        { text: 'Zweiter alter Abschnitt.', breaks: [] },
        { text: 'Dritter alter Abschnitt.', breaks: [] },
      ],
      created: 1,
    };
    const list = Array.from({ length: n }, (_, i) => ({
      d: 1700000000000 + i * 60000,
      b: 'bold',
      bt: 'Altes Buch',
      s: 0,
      wpm: 30 + i,
      raw: 32,
      acc: 98,
      err: 1,
      cons: 70,
      dur: 30000,
      strict: true,
    }));
    const profile = { n: 500, sessions: n, ch: { a: [500, 5] }, bg: {}, cf: {}, cat: {}, bgN: 0, bgSum: 0 };
    localStorage.setItem(P + 'books', JSON.stringify([book]));
    localStorage.setItem(P + 'sessions', JSON.stringify(list));
    localStorage.setItem(P + 'profile', JSON.stringify(profile));
    localStorage.setItem(P + 'progress', JSON.stringify({ bold: 2, demo: 1 }));
    localStorage.setItem(P + 'done', JSON.stringify({ bold: [0, 1] }));
    localStorage.setItem(P + 'current', JSON.stringify('bold'));
  }, sessions);
}

test('Daten aus localStorage werden nach IndexedDB übernommen', async ({ page }) => {
  await seedLegacy(page, 3);
  await page.goto('./');
  await expect(page.locator('#bookTitle')).toHaveText('Altes Buch');
  await expect(page.locator('#secInfo')).toHaveText('Abschnitt 3 / 3');
  const keys = await page.evaluate(() => Object.keys(localStorage).sort());
  expect(keys).toEqual(['typenhebel.v1.settings']);

  await page.locator('#profBtn').click();
  await expect(page.locator('#profBody')).toContainText('3 Abschnitte · 500 Anschläge');
  await expect(page.locator('#profBody tbody tr')).toHaveCount(3);
  await page.locator('#profClose').click();

  await page.reload();
  await expect(page.locator('#bookTitle')).toHaveText('Altes Buch');
  await expect(page.locator('#bookSel option:checked')).toHaveText('Altes Buch · 66 %');
});

test('Buchmenü wechselt zwischen Büchern und merkt sich die Stelle', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#bookSel')).toBeHidden(); // nur Demotext
  await page.locator('#next').click();
  await expect(page.locator('#secInfo')).toHaveText(/^Abschnitt 2 \//);

  await importEpub(page);
  const sel = page.locator('#bookSel');
  await expect(sel).toBeVisible();
  await expect(sel.locator('option:not([disabled])')).toHaveText(['Demotext', 'Testbuch', 'Text laden …']);

  await sel.selectOption({ label: 'Demotext' });
  await expect(page.locator('#bookTitle')).toHaveText('Demotext');
  await expect(page.locator('#secInfo')).toHaveText(/^Abschnitt 2 \//);
  await expect(page.locator('#chapSel')).toBeHidden();
  await expect(page.locator('#inp')).toBeFocused();

  await sel.selectOption({ label: 'Testbuch' });
  await expect(page.locator('#bookTitle')).toHaveText('Testbuch');
  await expect(page.locator('#chapSel')).toBeVisible();

  await page.reload();
  await expect(page.locator('#bookTitle')).toHaveText('Testbuch');

  await sel.selectOption({ label: 'Text laden …' });
  await expect(page.locator('#loadDlg')).toBeVisible();
  await expect(sel).toHaveValue(/.+/);
  await page.locator('#ldClose').click();

  // Löschen: Menü verschwindet wieder, Demotext ist offen
  await page.locator('#loadBtn').click();
  page.once('dialog', (d) => d.accept());
  await page.locator('[data-del]').click();
  await expect(page.locator('#bookList li')).toHaveCount(1);
  await page.locator('#ldClose').click();
  await expect(page.locator('#bookTitle')).toHaveText('Demotext');
  await expect(sel).toBeHidden();
});

test('Export und Import: Rundreise in einen leeren Browser', async ({ page, browser }) => {
  await page.goto('./');
  await importEpub(page);
  await typeSection(page);
  await page.keyboard.press('Enter');

  await page.locator('#profBtn').click();
  await expect(page.locator('#profStore')).toContainText('Seit der letzten Sicherung: 1 Abschnitt.');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#profExport').click()]);
  const file = await download.path();
  await expect(page.locator('#profMsg')).toHaveText('Sicherung gespeichert.');
  await expect(page.locator('#profStore')).not.toContainText('Seit der letzten Sicherung');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(data).toMatchObject({ app: 'typenhebel', schema: 2 });
  expect(data.sessions).toHaveLength(1);
  expect(data.sessions[0].events.length).toBeGreaterThan(10);
  expect(data.books).toHaveLength(1);

  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await seedSettings(other, { strict: true, sound: false, theme: 'light' });
  await other.goto('./');
  await other.locator('#profBtn').click();
  await other.locator('#profFile').setInputFiles(file);
  await expect(other.locator('#profMsg')).toHaveText('1 Abschnitt übernommen, 1 Buch.');
  await expect(other.locator('#profBody')).toContainText('1 Abschnitt ·');
  await other.locator('#profFile').setInputFiles(file);
  await expect(other.locator('#profMsg')).toHaveText('0 Abschnitte übernommen, 1 schon vorhanden.');
  await expect(other.locator('#profBody')).toContainText('1 Abschnitt ·');
  await other.locator('#profClose').click();
  await other.locator('#bookSel').selectOption({ label: 'Testbuch · 33 %' });
  await expect(other.locator('#chapSel option').first()).toHaveText('✓ Motto · 1/1');
  await ctx.close();
});

test('ungültige Sicherung wird abgewiesen', async ({ page }) => {
  await page.goto('./');
  await page.locator('#profBtn').click();
  await page
    .locator('#profFile')
    .setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hallo":1}') });
  await expect(page.locator('#profMsg')).toHaveText('Die Datei ist keine Typenhebel-Sicherung.');
  await expect(page.locator('#profMsg')).toHaveClass(/err/);
});

test('Erinnerung zum Sichern nach 30 Abschnitten', async ({ page }) => {
  await seedLegacy(page, 29);
  await page.goto('./');
  await page.locator('#bookSel').selectOption({ label: 'Demotext' });
  await typeSection(page);
  await expect(page.locator('#resRemind')).toContainText('30 Abschnitte');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#resExport').click()]);
  expect(download.suggestedFilename()).toMatch(/^typenhebel-\d{4}-\d\d-\d\d\.json$/);
  await expect(page.locator('#resRemind')).toHaveCount(0);
  await expect(page.locator('#resNext')).toBeFocused();
});
