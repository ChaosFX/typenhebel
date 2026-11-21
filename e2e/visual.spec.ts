// Screenshot-Vergleich mit dem Prototyp (SPEC §7, Phase 0): gleiche Ausgangslage, Pixel-Differenz muss 0 sein.
// Bewusste Ergänzungen gegenüber dem Prototyp werden vor dem Vergleich ausgeblendet.
// Die Logo-Zeile enthält auch das Hauptmenü (Bibliothek, Training, Profil); dazu die Knöpfe „Fokus“ und „Einstellungen“.
const ADDITIONS = ['.brand', '#focusBtn', '#setBtn'];
// Im Prototyp stehen „Text laden“ und „Profil“ noch bei den Einstellungen, Ton und Farbschema sind ins
// Einstellungs-Panel gewandert; dort ausblenden.
const MOVED = ['#loadBtn', '#profBtn', '#soundBtn', '#themeBtn'];
import { expect, test, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { openApp, seedSettings } from './helpers';

const PROTOTYPE = pathToFileURL(resolve('prototype/index.html')).href;

/**
 * Der Prototyp nennt Literata schon als erste Schrift, liefert sie aber nicht mit. Damit beide gleich rendern,
 * bekommt er im Test dieselben @font-face-Regeln wie die App, mit den Schriftdateien als data:-URLs.
 */
const FONT_FACES = (readFileSync(resolve('src/styles.css'), 'utf8').match(/@font-face\s*{[^}]*}/g) ?? [])
  .map((rule) =>
    rule.replace(/url\('\.\/(fonts\/[^']+)'\)/g, (_, file: string) => {
      const data = readFileSync(resolve('src', file)).toString('base64');
      return `url('data:font/woff2;base64,${data}')`;
    }),
  )
  .join('\n');

async function shot(page: Page, url: string, theme: string): Promise<PNG> {
  // Sichtbare Leerzeichen sind eine Ergänzung gegenüber dem Prototyp
  await seedSettings(page, { strict: true, sound: false, theme, spaces: false });
  await page.goto(url);
  await page.locator('#text .c').first().waitFor();
  await page.locator('#inp').focus();
  const proto = url.startsWith('file:');
  const hide = proto ? MOVED : ADDITIONS;
  // Den Cursor setzt der Prototyp, bevor die Schrift geladen ist, und rechnet danach nicht neu; seine Lage prüft
  // deshalb ein eigener Test unten.
  await page.addStyleTag({
    content: hide.join(',') + '{display:none!important} .caret{visibility:hidden}' + (proto ? FONT_FACES : ''),
  });
  await page.evaluate(() => document.fonts.ready);
  return PNG.sync.read(await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' }));
}

for (const theme of ['light', 'dark']) {
  test(`deckungsgleich mit Prototyp (${theme})`, async ({ browser }, info) => {
    const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const proto = await shot(await ctxA.newPage(), PROTOTYPE, theme);
    const app = await shot(await ctxB.newPage(), info.project.use.baseURL!, theme);
    expect([app.width, app.height]).toEqual([proto.width, proto.height]);
    const diff = new PNG({ width: app.width, height: app.height });
    const n = pixelmatch(proto.data, app.data, diff.data, app.width, app.height, { threshold: 0 });
    if (n > 0) await info.attach('diff', { body: PNG.sync.write(diff), contentType: 'image/png' });
    expect(n).toBe(0);
    await ctxA.close();
    await ctxB.close();
  });
}

test('Cursor sitzt nach dem Laden der Schrift am Zeichen, als Strich oder Unterstrich', async ({ page }) => {
  await seedSettings(page, { strict: true, sound: false, theme: 'light' });
  await openApp(page);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('1em Literata'))).toBe(true);
  const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
  const first = await box('#text .c');

  let caret = await box('#text .caret');
  expect(caret.width).toBeCloseTo(2, 0);
  expect(Math.abs(caret.x - first.x)).toBeLessThan(1.5);
  expect(Math.abs(caret.height - first.height)).toBeLessThan(1);

  await page.locator('#setBtn').click();
  await page.locator('#set-caret').getByRole('radio', { name: 'Unterstrich' }).check();
  await page.keyboard.press('Escape');
  await expect(page.locator('#setDlg')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-caret', 'underline');
  await page.waitForTimeout(150); // Übergang der Breite abwarten
  caret = await box('#text .caret');
  expect(caret.height).toBeCloseTo(3, 0);
  expect(Math.abs(caret.width - first.width)).toBeLessThan(1);
  expect(Math.abs(caret.y - (first.y + first.height - 1))).toBeLessThan(1.5);

  // Einstellung bleibt nach dem Neuladen erhalten
  await openApp(page, true);
  await expect(page.locator('html')).toHaveAttribute('data-caret', 'underline');
  await page.locator('#setBtn').click();
  await expect(page.locator('#set-caret input[value=underline]')).toBeChecked();
});
