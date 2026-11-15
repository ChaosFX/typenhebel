import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { makeEpub } from '../tests/fixtures/make-epub';
import { asTyped, openApp, sectionText, seedSettings } from './helpers';

test.beforeEach(async ({ page }) => {
  await seedSettings(page, { strict: true, sound: false, theme: 'light' });
  await openApp(page);
});

async function upload(page: Page, name: string, buffer: Buffer): Promise<void> {
  await page.locator('#libBtn').click();
  await page.locator('#libLoad').click();
  await page.locator('#ldFile').setInputFiles({ name, mimeType: 'application/epub+zip', buffer });
}

test('EPUB importieren: Kapitel, Motto, Fußnoten, seltene Zeichen', async ({ page }) => {
  await upload(page, 'testbuch.epub', Buffer.from(makeEpub()));
  await expect(page.locator('#ldInfo')).toContainText('EPUB erkannt: 3 Kapitel');
  await expect(page.locator('#ldTitle')).toHaveValue('Testbuch');
  await expect(page.locator('#ldAuthor')).toHaveValue('Erika Muster');
  await expect(page.locator('#ldRare')).toBeVisible();
  await expect(page.locator('#ldRareList')).toContainText('χ → ch');
  await page.locator('#ldGo').click();

  await expect(page.locator('#bookTitle')).toHaveText('Testbuch');
  const sel = page.locator('#chapSel');
  await expect(sel).toBeVisible();
  await expect(sel.locator('option')).toHaveText(['Motto · 0/1', 'Erstes Kapitel · 0/1', 'Zweites Kapitel · 0/1']);
  await expect(page.locator('#secInfo')).toHaveText('Abschnitt 1 / 1');
  expect(await sectionText(page)).toBe('»Erst die Sicherheit, dann das Tempo.« Unbekannt');

  // Abschnitt tippen → Ergebnis nennt das Kapitel, Fortschritt wird markiert
  await page.keyboard.type(asTyped(await sectionText(page)));
  await expect(page.locator('#resultCard .sub')).toHaveText('Testbuch · Motto · Abschnitt 1 von 1');
  await page.keyboard.press('Enter');
  await expect(sel).toHaveValue('1');
  await expect(sel.locator('option').first()).toHaveText('✓ Motto · 1/1');

  // Kapitelwahl
  await sel.selectOption('2');
  const text = await sectionText(page);
  expect(text.startsWith('Hiob.')).toBe(true);
  expect(text).toContain('chetos griechisch'); // seltene Zeichen ersetzt
  expect(text).not.toMatch(/Endnote|Fußnote darf/);
  await expect(page.locator('#inp')).toBeFocused();

  // Fortschritt bleibt nach Neuladen
  await openApp(page, true);
  await expect(page.locator('#chapSel')).toHaveValue('2');
  await expect(page.locator('#chapSel option').first()).toHaveText('✓ Motto · 1/1');
});

test('seltene Zeichen bleiben, wenn Ersetzen abgewählt ist', async ({ page }) => {
  await upload(page, 'testbuch.epub', Buffer.from(makeEpub()));
  await page.locator('#ldReplace').uncheck();
  await page.locator('#ldGo').click();
  await page.locator('#chapSel').selectOption('2');
  expect(await sectionText(page)).toContain('χητος griechisch');
});

test('kaputtes EPUB wird verständlich abgewiesen', async ({ page }) => {
  await upload(page, 'kaputt.epub', Buffer.from('kein zip'));
  await expect(page.locator('#ldMsg')).toHaveText(/kein gültiges EPUB/);
  await expect(page.locator('#ldInfo')).toBeHidden();
});

const ZWEIG = 'samples/die-welt-von-gestern.epub';
test('Die Welt von Gestern: ganzes Buch passt in den Speicher', async ({ page }) => {
  test.skip(!fs.existsSync(ZWEIG), 'Beispiel-EPUB liegt nur lokal vor');
  await upload(page, 'die-welt-von-gestern.epub', fs.readFileSync(ZWEIG));
  await expect(page.locator('#ldInfo')).toContainText('18 Kapitel');
  await expect(page.locator('#ldRareList')).toContainText('½ → 1/2');
  await page.locator('#ldGo').click();
  await expect(page.locator('#chapSel option')).toHaveCount(18);
  await expect(page.locator('#bookTitle')).toHaveText('Die Welt von Gestern');
  await page.locator('#chapSel').selectOption('1');
  expect((await sectionText(page)).startsWith('Ich habe meiner Person niemals so viel Wichtigkeit beigemessen')).toBe(
    true,
  );
  await openApp(page, true);
  await expect(page.locator('#chapSel option')).toHaveCount(18);
  await expect(page.locator('#chapSel')).toHaveValue('1');
});
