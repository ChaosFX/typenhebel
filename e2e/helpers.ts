import type { Page } from '@playwright/test';

/** Text des aktuellen Abschnitts, wie er angezeigt wird. */
export const sectionText = (page: Page): Promise<string> =>
  page.locator('#text .c').evaluateAll((els) => els.map((e) => e.textContent ?? '').join(''));

/** Typografische Zeichen auf ihre Tastatur-Entsprechung abbilden (wie ein Mensch tippen würde). */
export const asTyped = (s: string): string =>
  s
    .replace(/[„“”»«]/g, '"')
    .replace(/[‚‘’›‹]/g, "'")
    .replace(/[–—]/g, '-');

export async function seedSettings(page: Page, settings: Record<string, unknown>): Promise<void> {
  await page.addInitScript((s) => {
    if (!localStorage.getItem('anschlag.v1.settings')) localStorage.setItem('anschlag.v1.settings', JSON.stringify(s));
  }, settings);
}
