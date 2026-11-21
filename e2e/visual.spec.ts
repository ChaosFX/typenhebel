// Lage des Cursors nach dem Laden der Schrift. Der frühere Pixelvergleich mit prototype/ ist seit 2026-11-21 verworfen
// (die App ist über den Prototyp hinausgewachsen).
import { expect, test } from '@playwright/test';
import { openApp, seedSettings } from './helpers';

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
