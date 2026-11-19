<script lang="ts">
  // Profil-Reiter „Überblick“: das Wichtigste auf einen Blick, Details in den anderen Reitern
  import { hint, type Analysis } from '../core';
  import { app } from '../app/state.svelte';
  import { f1, showCh } from '../ui/format';
  import Progress from './Progress.svelte';

  let { a, goto }: { a: Analysis | null; goto: (tab: 'keys' | 'backup') => void } = $props();

  const RECENT = 10;
  const recent = $derived(app.sessions.slice(-RECENT));
  const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const wpm = $derived(mean(recent.map((s) => s.stats.wpm)));
  const acc = $derived(mean(recent.map((s) => s.stats.accuracy)));
  const cons = $derived(mean(recent.flatMap((s) => (s.stats.consistency === null ? [] : [s.stats.consistency]))));
  const tip = $derived(hint(a));
  const since = $derived(app.sessions.length - app.exportedAtSessions);

  /** Je Art die auffälligste Stelle, damit der Überblick kurz bleibt */
  const top = $derived.by(() => {
    if (!a) return [];
    const out: [string, string, string][] = [];
    const s = a.slow[0];
    if (s) out.push(['Langsamste Kombination', s.k.replace(/ /g, '␣'), `${Math.round(s.ms)} ms · ×${f1(s.ratio)}`]);
    const e = a.errChars[0];
    if (e) out.push(['Fehleranfälligstes Zeichen', showCh(e.k), `${e.e} von ${e.n} · ${Math.round(e.rate * 100)} %`]);
    const c = a.conf[0];
    if (c) out.push(['Häufigste Verwechslung', `${showCh(c.exp)} → ${showCh(c.got)}`, `${c.n}×`]);
    return out;
  });
</script>

{#if !recent.length}
  <p class="empty">Noch keine Abschnitte abgeschlossen. Nach dem ersten Abschnitt findest du hier deine Werte.</p>
{:else}
  <div class="big three" id="profStats">
    <div><b>{Math.round(wpm ?? 0)}</b><span>WPM netto</span></div>
    <div><b>{f1((acc ?? 0) * 100)} %</b><span>Genauigkeit</span></div>
    <div><b>{cons === null ? '–' : Math.round(cons) + ' %'}</b><span>Gleichmäßigkeit</span></div>
  </div>
  <p class="small">
    Durchschnitt der letzten {recent.length}
    {recent.length === 1 ? 'Abschnitts' : 'Abschnitte'}.
  </p>
  <Progress />
  {#if tip}<div class="tip">{tip}</div>{/if}
  {#if top.length}
    <h3 class="deep-h">Am auffälligsten</h3>
    <ul class="list">
      {#each top as [what, key, detail] (what)}
        <li><span>{what}: <span class="mono">{key}</span></span><span>{detail}</span></li>
      {/each}
    </ul>
    <p class="more"><button class="link" onclick={() => goto('keys')}>Alle Auswertungen unter „Tasten“</button></p>
  {/if}
  {#if app.exportDue}
    <p class="remind" id="profRemind">
      Seit deiner letzten Sicherung hast du {since} Abschnitte geübt.
      <button class="link" onclick={() => goto('backup')}>Zum Sichern</button>
    </p>
  {/if}
{/if}
