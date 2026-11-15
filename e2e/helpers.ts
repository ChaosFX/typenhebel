import { expect, type Page } from '@playwright/test';

/** Text des aktuellen Abschnitts, wie er angezeigt wird. */
export const sectionText = (page: Page): Promise<string> =>
  page.locator('#text .c').evaluateAll((els) => els.map((e) => e.textContent ?? '').join(''));

/** Typografische Zeichen auf ihre Tastatur-Entsprechung abbilden (wie ein Mensch tippen würde). */
export const asTyped = (s: string): string =>
  s
    .replace(/[„“”»«]/g, '"')
    .replace(/[‚‘’›‹]/g, "'")
    .replace(/[–—]/g, '-');

/** Einstellungen vorbelegen – für die App (typenhebel.v1) und den Prototyp (anschlag.v1). */
export async function seedSettings(page: Page, settings: Record<string, unknown>): Promise<void> {
  await page.addInitScript((s) => {
    const prefix = location.protocol === 'file:' ? 'anschlag.v1.' : 'typenhebel.v1.';
    if (!localStorage.getItem(prefix + 'settings')) localStorage.setItem(prefix + 'settings', JSON.stringify(s));
  }, settings);
}

/** App öffnen und warten, bis der gespeicherte Stand geladen ist (vorher ist die Kopfzeile leer). */
export async function openApp(page: Page, reload = false): Promise<void> {
  await (reload ? page.reload() : page.goto('./'));
  await expect(page.locator('#secInfo')).toHaveText(/^Abschnitt \d+ \//);
}
