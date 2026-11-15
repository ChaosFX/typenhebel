import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { makeEpub } from '../tests/fixtures/make-epub';
import { asTyped, openApp, sectionText, seedSettings } from './helpers';

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
  await openApp(page);
  await expect(page.locator('#bookTitle')).toHaveText('Altes Buch');
  await expect(page.locator('#secInfo')).toHaveText('Abschnitt 3 / 3');
  const keys = await page.evaluate(() => Object.keys(localStorage).sort());
  expect(keys).toEqual(['typenhebel.v1.settings']);

  await page.locator('#profBtn').click();
  await expect(page.locator('#profBody')).toContainText('3 Abschnitte · 500 Anschläge');
  await expect(page.locator('#profHist tbody tr')).toHaveCount(3);
  await page.locator('#profClose').click();

  await openApp(page, true);
  await expect(page.locator('#bookTitle')).toHaveText('Altes Buch');
  await page.locator('#libBtn').click();
  await expect(page.locator('.shelf-item.current')).toContainText('Altes Buch');
  await expect(page.locator('.shelf-item.current')).toContainText('66 % geschafft');
});

/** Buch in der Bibliothek öffnen (Klick aufs Cover). */
async function openFromLibrary(page: Page, title: string): Promise<void> {
  await page.locator('#libBtn').click();
  await page.locator('#shelf .shelf-item', { hasText: title }).locator('.cover').click();
  await expect(page.locator('#libDlg')).toBeHidden();
  await expect(page.locator('#bookTitle')).toHaveText(title);
}

test('Bibliothek: Bücher wechseln, Stelle merken, Text laden, löschen', async ({ page }) => {
  await openApp(page);
  await page.locator('#next').click();
  await expect(page.locator('#secInfo')).toHaveText(/^Abschnitt 2 \//);

  // Nur Demotext: Bibliothek zeigt ihn und die Kachel zum Laden
  await page.locator('#libBtn').click();
  await expect(page.locator('#shelf .shelf-item')).toHaveCount(2);
  await expect(page.locator('.shelf-item.current')).toContainText('Gerade offen');
  await expect(page.locator('.shelf-item.current svg')).toHaveAttribute('aria-label', 'Demotext – Typenhebel');
  await expect(page.locator('.shelf-item.current [data-del]')).toHaveCount(0);
  await page.locator('#libLoad').click();
  await expect(page.locator('#loadDlg')).toBeVisible();
  await page
    .locator('#ldFile')
    .setInputFiles({ name: 'testbuch.epub', mimeType: 'application/epub+zip', buffer: Buffer.from(makeEpub()) });
  await expect(page.locator('#ldInfo')).toBeVisible();
  await page.locator('#ldGo').click();
  await expect(page.locator('#libDlg')).toBeHidden();
  await expect(page.locator('#bookTitle')).toHaveText('Testbuch');

  await openFromLibrary(page, 'Demotext');
  await expect(page.locator('#secInfo')).toHaveText(/^Abschnitt 2 \//);
  await expect(page.locator('#chapSel')).toBeHidden();
  await expect(page.locator('#inp')).toBeFocused();

  await page.locator('#bookTitle').click(); // Titel öffnet ebenfalls die Bibliothek
  await expect(page.locator('#libDlg')).toBeVisible();
  await page.locator('#shelf .shelf-item', { hasText: 'Testbuch' }).locator('.cover').click();
  await expect(page.locator('#chapSel')).toBeVisible();
  await openApp(page, true);
  await expect(page.locator('#bookTitle')).toHaveText('Testbuch');

  // Löschen: Demotext öffnet sich wieder
  await page.locator('#libBtn').click();
  page.once('dialog', (d) => d.accept());
  await page.locator('#shelf .shelf-item', { hasText: 'Testbuch' }).locator('[data-del]').click();
  await expect(page.locator('#shelf .shelf-item')).toHaveCount(2);
  await expect(page.locator('#bookTitle')).toHaveText('Demotext');
});

test('Cover wechseln: Layout, Farbe, Würfeln, Standard – bleibt nach Neuladen', async ({ page }) => {
  await openApp(page);
  await page.locator('#libBtn').click();
  const cover = page.locator('.shelf-item.current .cover');
  const before = await cover.innerHTML();
  await page.locator('.shelf-item.current [data-cover]').click();
  await expect(page.locator('#coverDlg')).toBeVisible();
  await expect(page.locator('.cv-layout')).toHaveCount(4);
  await expect(page.locator('.cv-swatch')).toHaveCount(9);

  await page.locator('.cv-layout', { hasText: 'Typoskript' }).click();
  await expect(page.locator('.cv-layout', { hasText: 'Typoskript' })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.cv-swatch[title="Aubergine"]').click();
  await expect(page.locator('.cv-swatch[title="Aubergine"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#cvPrev svg rect').first()).toHaveAttribute('fill', '#45293f');
  const chosen = await page.locator('#cvPrev').innerHTML();
  await page.locator('#cvDone').click();
  await expect(cover).not.toHaveJSProperty('innerHTML', before);
  expect(await cover.innerHTML()).toBe(chosen);

  await openApp(page, true);
  await page.locator('#libBtn').click();
  expect(await page.locator('.shelf-item.current .cover').innerHTML()).toBe(chosen);

  await page.locator('.shelf-item.current [data-cover]').click();
  await page.locator('#cvDice').click();
  expect(await page.locator('#cvPrev').innerHTML()).not.toBe(chosen);
  await page.locator('#cvReset').click();
  expect(await page.locator('#cvPrev').innerHTML()).toBe(before);
  await page.locator('#cvDone').click();
  await expect(page.locator('.shelf-item.current [data-cover]')).toBeFocused();
});

test('Export und Import: Rundreise in einen leeren Browser', async ({ page, browser }) => {
  await openApp(page);
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
  await openApp(other);
  await other.locator('#profBtn').click();
  await other.locator('#profFile').setInputFiles(file);
  await expect(other.locator('#profMsg')).toHaveText('1 Abschnitt übernommen, 1 Buch.');
  await expect(other.locator('#profBody')).toContainText('1 Abschnitt ·');
  await other.locator('#profFile').setInputFiles(file);
  await expect(other.locator('#profMsg')).toHaveText('0 Abschnitte übernommen, 1 schon vorhanden.');
  await expect(other.locator('#profBody')).toContainText('1 Abschnitt ·');
  await other.locator('#profClose').click();
  await openFromLibrary(other, 'Testbuch');
  await expect(other.locator('#chapSel option').first()).toHaveText('✓ Motto · 1/1');
  await ctx.close();
});

test('ungültige Sicherung wird abgewiesen', async ({ page }) => {
  await openApp(page);
  await page.locator('#profBtn').click();
  await page
    .locator('#profFile')
    .setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hallo":1}') });
  await expect(page.locator('#profMsg')).toHaveText('Die Datei ist keine Typenhebel-Sicherung.');
  await expect(page.locator('#profMsg')).toHaveClass(/err/);
});

test('Erinnerung zum Sichern nach 30 Abschnitten', async ({ page }) => {
  await seedLegacy(page, 29);
  await openApp(page);
  await openFromLibrary(page, 'Demotext');
  await typeSection(page);
  await expect(page.locator('#resRemind')).toContainText('30 Abschnitte');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#resExport').click()]);
  expect(download.suggestedFilename()).toMatch(/^typenhebel-\d{4}-\d\d-\d\d\.json$/);
  await expect(page.locator('#resRemind')).toHaveCount(0);
  await expect(page.locator('#resNext')).toBeFocused();
});

test('Mitgelieferte Bücher: mit einem Klick laden, löschen, Fehler', async ({ page }) => {
  await openApp(page);
  await page.locator('#libBtn').click();
  await expect(page.locator('#availH')).toBeVisible();
  const faust = page.locator('#avail .shelf-item', { hasText: 'Faust' });
  await expect(faust).toContainText('Quelle: Projekt Gutenberg-DE');
  const n = await page.locator('#avail .shelf-item').count();
  expect(n).toBeGreaterThanOrEqual(4);

  await faust.locator('.cover').click();
  await expect(page.locator('#libDlg')).toBeHidden();
  await expect(page.locator('#bookTitle')).toHaveText('Faust: Eine Tragödie');
  await expect(page.locator('#chapSel option').first()).toHaveText(/^Zueignung/);
  expect((await sectionText(page)).startsWith('Ihr naht euch wieder, schwankende Gestalten')).toBe(true);

  await openApp(page, true);
  await page.locator('#libBtn').click();
  await expect(page.locator('#shelf .shelf-item.current')).toContainText('Quelle: Projekt Gutenberg-DE');
  await expect(page.locator('#avail .shelf-item')).toHaveCount(n - 1);

  page.once('dialog', (d) => d.accept());
  await page.locator('#shelf .shelf-item.current [data-del]').click();
  await expect(page.locator('#avail .shelf-item')).toHaveCount(n);
  await expect(page.locator('#bookTitle')).toHaveText('Demotext');

  // Server antwortet nicht: verständliche Meldung, nichts gespeichert
  await page.route('**/corpus/goethe-faust.json', (r) => r.fulfill({ status: 500 }));
  await page.locator('#avail .shelf-item', { hasText: 'Faust' }).locator('.cover').click();
  await expect(page.locator('#libMsg')).toHaveText(/konnte nicht geladen werden/);
  await expect(page.locator('#avail .shelf-item')).toHaveCount(n);
  await expect(page.locator('#libDlg')).toBeVisible();
});
