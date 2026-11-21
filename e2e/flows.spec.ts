import { expect, test } from '@playwright/test';
import { asTyped, openApp, sectionText, seedSettings } from './helpers';

test.beforeEach(async ({ page }) => {
  await seedSettings(page, { strict: true, sound: false, theme: 'light' });
  await openApp(page);
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
  await page.locator('#profBtn').click();
  await expect(page.locator('#profSummary')).toHaveText(/^1 Abschnitt · \d+ Anschläge ausgewertet\.$/);
  // Phase 4: Reiter, Überblick zuerst; der Fokus liegt auf dem aktiven Reiter, Pfeiltasten wechseln
  const tab = (name: string) => page.getByRole('tab', { name });
  await expect(tab('Überblick')).toBeFocused();
  await expect(tab('Überblick')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#profStats')).toContainText('WPM netto');
  await page.keyboard.press('ArrowRight');
  await expect(tab('Tasten')).toBeFocused();
  await expect(tab('Tasten')).toHaveAttribute('aria-selected', 'true');
  // Phase 3: Tasten-Wärmebild, Finger, Fehlerarten
  await expect(page.locator('.keymap .key')).toHaveCount(49);
  await expect(page.locator('.finger-table tbody tr').first()).toContainText('Kleiner Finger links');
  await expect(page.locator('.finger-table')).toContainText('Hand rechts');
  await expect(page.locator('.error-kinds')).toContainText('letzte 1 Abschnitt, 0 Fehler');
  await expect(page.locator('.rhythm')).toContainText('Rhythmus · letzte 1 Abschnitt');
  await page.keyboard.press('ArrowRight');
  await expect(tab('Verlauf')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#profPanel')).toContainText('Der Verlauf erscheint ab dem zweiten Übungstag.');
  await expect(page.locator('#profHist tbody tr')).toHaveCount(1);
  // Der gewählte Reiter bleibt beim nächsten Öffnen
  await page.keyboard.press('Escape');
  await page.locator('#profBtn').click();
  await expect(tab('Verlauf')).toBeFocused();
});

test('Strikt: Fehler blockiert den Cursor', async ({ page }) => {
  const first = (await sectionText(page))[0]!;
  const spans = page.locator('#text .c');
  await page.keyboard.type('#');
  await expect(spans.nth(0)).not.toHaveClass(/\bok\b/);
  await expect(spans.nth(0)).toHaveClass(/\bbad\b/);
  await expect(page.locator('#lAcc')).toHaveText('0 %');
  await page.keyboard.press('Backspace'); // wirkungslos im strikten Modus
  await page.keyboard.type(first);
  await expect(spans.nth(0)).toHaveClass(/\bok\b/);
  await expect(spans.nth(0)).not.toHaveClass(/\bbad\b/);
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

test('Einfügen ist wirkungslos', async ({ page, context, browserName }) => {
  // Firefox kennt diese Berechtigungen nicht und erlaubt die Zwischenablage ohnehin.
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
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
  await openApp(page, true);
  await expect(page.locator('#secInfo')).toHaveText(/^Abschnitt 2 \//);
});

test('Logo und Favicons sind eingebunden', async ({ page, request }) => {
  await expect(page.locator('.brand-name')).toHaveText('Typenhebel');
  await expect(page.locator('.brand .mark')).toBeVisible();
  const icons = await page
    .locator('link[rel="icon"], link[rel="apple-touch-icon"]')
    .evaluateAll((ls) => ls.map((l) => (l as HTMLLinkElement).href));
  expect(icons).toHaveLength(3);
  for (const href of icons) expect((await request.get(href)).status()).toBe(200);
});

test('Training: Übungen mit Begründung, nach dem Neuladen wieder das Buch', async ({ page }) => {
  await expect(page.locator('#loadBtn')).toHaveCount(0); // Laden geht über die Bibliothek
  await page.locator('#trainBtn').click();
  await expect(page.locator('#bookTitle')).toHaveText('Training');
  await expect(page.locator('#bookAuthor')).toHaveText(/^(Wort-Drill „.+“ – weil |Sätze mit „)/);
  const n = Number((await page.locator('#secInfo').textContent())!.match(/\/ (\d+)/)![1]);
  expect(n).toBeGreaterThanOrEqual(2);
  await page.keyboard.type(asTyped(await sectionText(page)));
  await expect(page.locator('#resTitle')).toHaveText('Abschnitt geschafft');
  await expect(page.locator('#resultCard .sub')).toHaveText(`Training · Abschnitt 1 von ${n}`);
  await page.keyboard.press('Enter');
  await expect(page.locator('#secInfo')).toHaveText(`Abschnitt 2 / ${n}`);

  await page.locator('#profBtn').click();
  await page.getByRole('tab', { name: 'Verlauf' }).click();
  await expect(page.locator('#profHist tbody tr').first()).toContainText('Training · 1');
  await page.locator('#profClose').click();

  await openApp(page, true);
  await expect(page.locator('#bookTitle')).toHaveText('Demotext');
  await expect(page.locator('#secInfo')).toHaveText(/^Abschnitt 1 \//);
});

test('Schreibmaschinen-Tastatur: im Training sichtbar, zeigt die nächste Taste, umschaltbar', async ({ page }) => {
  await expect(page.locator('.typewriter')).toBeHidden(); // in Büchern standardmäßig aus
  const kb = async (value: string): Promise<void> => {
    await page.locator('#setBtn').click();
    await page.locator(`#set-keyboard input[value=${value}]`).check();
    await page.locator('#setBtn').click();
    await expect(page.locator('#setDlg')).toBeHidden();
  };
  await page.locator('#setBtn').click();
  await expect(page.locator('#set-keyboard input[value=training]')).toBeChecked();
  await page.locator('#setBtn').click();
  await page.locator('#trainBtn').click();
  await expect(page.locator('#bookTitle')).toHaveText('Training');
  await expect(page.locator('.typewriter')).toBeVisible();

  const text = asTyped(await sectionText(page));
  const next = async (i: number): Promise<void> => {
    const ch = text[i]!;
    const base = ch === ' ' ? ' ' : ch.toLowerCase();
    await expect(page.locator('.tw-key.next').first()).toHaveAttribute('data-k', base);
    await expect(page.locator('.tw-finger')).toContainText(ch === ' ' ? 'Leertaste · Daumen' : `${ch} · `);
  };
  await next(0);
  // Großbuchstabe: Taste und Umschalttaste der anderen Hand leuchten
  if (/\p{Lu}/u.test(text[0]!)) await expect(page.locator('.tw-key.next')).toHaveCount(2);
  await page.keyboard.type(text.slice(0, 3));
  await next(3);
  await page.keyboard.type('#'); // Fehler im strikten Modus: dieselbe Taste bleibt markiert
  await next(3);

  await kb('always');
  await expect(page.locator('.typewriter')).toBeVisible();
  await kb('off');
  await expect(page.locator('.typewriter')).toBeHidden();
  await expect(page.locator('.tw-key.next')).toHaveCount(0);
  await kb('training');
  await expect(page.locator('.typewriter')).toBeVisible();
  await next(3);
});

test('Ton an: Schreibmaschine lädt, Anschläge, Fehler und Abschluss ohne Warnungen', async ({ browser }) => {
  const page = await browser.newPage();
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(m.text()));
  await seedSettings(page, { strict: true, sound: true, theme: 'light' });
  const flac = page.waitForResponse((r) => r.url().endsWith('/sounds/hermes.flac'));
  await openApp(page);
  await page.locator('#inp').focus();
  expect((await flac).status()).toBe(200);
  await page.keyboard.type('#');
  await page.keyboard.type(asTyped(await sectionText(page)));
  await expect(page.locator('#resultVeil')).toBeVisible();
  await page.waitForTimeout(300); // Dekodieren abwarten: ein Fehlschlag würde als Warnung erscheinen
  expect(problems).toEqual([]);
  await page.close();
});

test('Einstellungen: Farbe, Textgröße und Lautstärke wirken sofort und bleiben gespeichert', async ({ page }) => {
  const fs = (): Promise<number> => page.locator('#text').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const before = await fs();
  await page.locator('#setBtn').click();
  await expect(page.locator('#setBtn')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#setDlg')).toBeVisible();

  await page.locator('#set-theme').getByRole('radio', { name: 'Sepia' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  await page.locator('#set-textSize').getByRole('radio', { name: 'sehr groß' }).check();
  expect(await fs()).toBeCloseTo(before * 1.32, 0);
  await expect(page.locator('#setVolume')).toBeDisabled(); // Ton im Test aus
  await page.locator('#setSound').check();
  await page.locator('#setVolume').fill('30');
  await page.locator('#setSound').uncheck();
  await expect(page.locator('#setVolume')).toBeDisabled();

  // Klick neben das Panel schließt es; danach geht das Tippen weiter
  await page.locator('#text').click();
  await expect(page.locator('#setDlg')).toBeHidden();
  await expect(page.locator('#inp')).toBeFocused();
  const first = asTyped(await sectionText(page))[0]!;
  await page.keyboard.type(first);
  await expect(page.locator('#text .c').first()).toHaveClass(/ok/);

  // Cursor sitzt auch bei großer Schrift am Zeichen (nach dem kurzen Übergang)
  const second = (await page.locator('#text .c').nth(1).boundingBox())!;
  await expect
    .poll(async () => Math.abs((await page.locator('#text .caret').boundingBox())!.x - second.x))
    .toBeLessThan(1.5);

  await openApp(page, true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  expect(await fs()).toBeCloseTo(before * 1.32, 0);
  await page.locator('#setBtn').click();
  await expect(page.locator('#setVolume')).toHaveValue('30');
  await expect(page.locator('#setSound')).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(page.locator('#setDlg')).toBeHidden();
  await expect(page.locator('#inp')).toBeFocused();
});

test('Fokus-Modus: nur der Text bleibt, Tippen läuft weiter, Zustand wird gespeichert', async ({ page }) => {
  const chrome = ['.brand', '.top', '.live', '.foot', '.bar'];
  await page.locator('#focusBtn').click();
  for (const sel of chrome) await expect(page.locator(sel)).toBeHidden();
  await expect(page.locator('#text')).toBeVisible();
  await expect(page.locator('#inp')).toBeFocused();
  const text = asTyped(await sectionText(page));
  await page.keyboard.type(text.slice(0, 3));
  await expect(page.locator('#text .c.ok')).toHaveCount(3);

  await openApp(page, true);
  await expect(page.locator('.top')).toBeHidden();
  await page.locator('#focusExit').click();
  for (const sel of chrome) await expect(page.locator(sel)).toBeVisible();
  await expect(page.locator('#focusExit')).toHaveCount(0);
  await expect(page.locator('#inp')).toBeFocused();
});
