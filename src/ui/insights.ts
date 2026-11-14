import { hint, type Analysis } from '../core';
import { esc, f1, showCh } from './format';

export function sparkSvg(vals: number[]): string {
  if (vals.length < 2) return '';
  const W = 300;
  const H = 60;
  const mx = Math.max(...vals);
  const mn = Math.min(...vals);
  const rg = Math.max(1, mx - mn);
  const flat = mx - mn < 1;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * W, flat ? H / 2 : H - 8 - ((v - mn) / rg) * (H - 18)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0]!.toFixed(1) + ' ' + p[1]!.toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Tempoverlauf">
    <defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
    <path d="${d} L${W} ${H} L0 ${H} Z" fill="url(#sg)"/>
    <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}

export function insightsHtml(a: Analysis | null): string {
  if (!a) return '<p class="empty">Noch keine Daten.</p>';
  const note = a.n < 3000 ? ` <span class="note">· vorläufig (${a.n} Anschläge)</span>` : '';
  let h = `<div class="cols"><div><h3>Langsame Kombinationen${note}</h3>`;
  h += a.slow.length
    ? `<ul class="list">${a.slow.map((x) => `<li><span class="mono">${esc(x.k.replace(/ /g, '␣'))}</span><span>${Math.round(x.ms)} ms · ×${f1(x.ratio)}</span></li>`).join('')}</ul>`
    : '<p class="empty">Noch nichts Auffälliges.</p>';
  h += `</div><div><h3>Fehleranfällige Zeichen</h3>`;
  h += a.errChars.length
    ? `<ul class="list">${a.errChars.map((x) => `<li><span class="mono">${esc(showCh(x.k))}</span><span>${x.e} von ${x.n} · ${Math.round(x.rate * 100)} %</span></li>`).join('')}</ul>`
    : '<p class="empty">Keine wiederkehrenden Fehler.</p>';
  h += `</div><div><h3>Verwechslungen</h3>`;
  h += a.conf.length
    ? `<ul class="list">${a.conf.map((x) => `<li><span>soll <span class="mono">${esc(showCh(x.exp))}</span> · getippt <span class="mono">${esc(showCh(x.got))}</span></span><span>${x.n}×</span></li>`).join('')}</ul>`
    : '<p class="empty">Keine Fehler – stark.</p>';
  h += `</div><div><h3>Fehlerquote nach Zeichenart</h3>`;
  const cap = Math.max(0.1, ...a.cats.map((c) => c.rate));
  h += a.cats.length
    ? a.cats
        .map(
          (c) =>
            `<div class="cat"><span>${esc(c.k)}</span><div class="meter"><i style="width:${Math.min(100, (c.rate / cap) * 100)}%"></i></div><b>${(c.rate * 100).toFixed(1).replace('.', ',')} %</b></div>`,
        )
        .join('')
    : '<p class="empty">Noch zu wenig Daten.</p>';
  h += '</div></div>';
  const t = hint(a);
  if (t) h += `<div class="tip">${esc(t)}</div>`;
  return h;
}
