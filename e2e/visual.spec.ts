// Screenshot-Vergleich mit dem Prototyp (SPEC §7, Phase 0): gleiche Ausgangslage, Pixel-Differenz muss 0 sein.
// Bewusste Ergänzungen gegenüber dem Prototyp werden vor dem Vergleich ausgeblendet.
const ADDITIONS = ['.brand'];
import { expect, test, type Page } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { seedSettings } from './helpers';

const PROTOTYPE = pathToFileURL(resolve('prototype/index.html')).href;

async function shot(page: Page, url: string, theme: string): Promise<PNG> {
  await seedSettings(page, { strict: true, sound: false, theme });
  await page.goto(url);
  await page.locator('#text .c').first().waitFor();
  await page.locator('#inp').focus();
  if (!url.startsWith('file:')) await page.addStyleTag({ content: ADDITIONS.join(',') + '{display:none!important}' });
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
