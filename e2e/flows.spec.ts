import { expect, test } from '@playwright/test';
import { asTyped, sectionText, seedSettings } from './helpers';

test.beforeEach(async ({ page }) => {
  await seedSettings(page, { strict: true, sound: false, theme: 'light' });
  await page.goto('./');
  await expect(page.locator('#secInfo')).toHaveText(/^Abschnitt 1 \//);
});

test('Abschnitt komplett tippen führt zum Ergebnis', async ({ page }) => {
  const text = await sectionText(page);
  await page.keyboard.type(asTyped(text));
  await expect(page.locator('#resultVeil')).toBeVisible();
  await expect(page.locator('#resTitle')).toHaveText('Abschnitt geschafft');
  await expect(page.locator('.badge', { hasText: 'Fehlerfrei' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#resultVeil')).toBeHidden();
  await expect(page.locator('#secInfo')).toHaveText(/^Abschnitt 2 \//);
});

test('Strikt: Fehler blockiert den Cursor', async ({ page }) => {
  const first = (await sectionText(page))[0]!;
  const spans = page.locator('#text .c');
  await page.keyboard.type('#');
  await expect(spans.nth(0)).not.toHaveClass(/\bok\b/);
  await expect(page.locator('#lAcc')).toHaveText('0 %');
  await page.keyboard.press('Backspace'); // wirkungslos im strikten Modus
  await page.keyboard.type(first);
  await expect(spans.nth(0)).toHaveClass(/\bok\b/);
  await expect(spans.nth(1)).not.toHaveClass(/\bok\b/);
  await expect(page.locator('#lAcc')).toHaveText('50 %');
});

test('Frei: Fehler bleibt stehen, Rücktaste korrigiert', async ({ page }) => {
  await page.locator('#modeBtn').click();
  await expect(page.locator('#modeBtn')).toHaveText('Modus: Frei');
  const text = await sectionText(page);
  const spans = page.locator('#text .c');
  await page.keyboard.type(text[0]! + '#');
  await expect(spans.nth(0)).toHaveClass(/\bok\b/);
  await expect(spans.nth(1)).toHaveClass(/\bbad\b/);
  await page.keyboard.press('Backspace');
  await expect(spans.nth(1)).toHaveClass('c');
  await page.keyboard.type(text[1]!);
  await expect(spans.nth(1)).toHaveClass(/\bok\b/);
});

test('Einfügen ist wirkungslos', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const text = await sectionText(page);
  await page.evaluate((t) => navigator.clipboard.writeText(t), text.slice(0, 40));
  await page.locator('#inp').focus();
  await page.keyboard.press('ControlOrMeta+V');
  await expect(page.locator('#text .c.ok')).toHaveCount(0);
  await expect(page.locator('#lStreak')).toHaveText('0');
});

test('Neuladen behält den Fortschritt', async ({ page }) => {
  await page.locator('#next').click();
  await expect(page.locator('#secInfo')).toHaveText(/^Abschnitt 2 \//);
  await page.reload();
  await expect(page.locator('#secInfo')).toHaveText(/^Abschnitt 2 \//);
});
