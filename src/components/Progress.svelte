<script lang="ts">
  // Verbesserungen seit letzter Woche (SPEC Phase 6), aus den Kurzfassungen in IndexedDB
  import { changeParts, compareWeeks, weekWindows, type ProgressReport } from '../core';
  import { app } from '../app/state.svelte';
  import { loadDigests } from '../data/db';
  import { f1 } from '../ui/format';

  let report = $state<ProgressReport | null>(null);
  let loaded = $state(false);

  // Neu laden, wenn der Dialog aufgeht oder Abschnitte dazukommen bzw. importiert werden
  $effect(() => {
    const db = app.db;
    if (!app.profOpen || !db) return;
    void app.sessions.length;
    const now = Date.now();
    let stale = false;
    loadDigests(db, weekWindows(now).from).then(
      (items) => {
        if (stale) return;
        report = compareWeeks(items, now);
        loaded = true;
      },
      (e: unknown) => console.error(e),
    );
    return () => {
      stale = true;
    };
  });

  const plural = (n: number): string => (n === 1 ? 'Abschnitt' : 'Abschnitte');
  const overallText = $derived.by(() => {
    if (!report) return null;
    const { before: a, after: b } = report;
    const ms = a.ms !== null && b.ms !== null ? `Ø ${Math.round(a.ms)} → ${Math.round(b.ms)} ms je Anschlag, ` : '';
    return `${ms}Fehler ${f1(a.rate * 100)} → ${f1(b.rate * 100)} % (${a.sessions} → ${b.sessions} ${plural(b.sessions)})`;
  });
</script>

{#if app.db && loaded}
  <div class="progress" id="profProgress">
    <h3 class="deep-h">
      Seit letzter Woche <span class="note">· letzte 7 Tage gegenüber den 7 Tagen davor</span>
    </h3>
    {#if !report}
      <p class="empty">Der Vergleich erscheint, sobald du in beiden Wochen geübt hast.</p>
    {:else}
      <p class="small">{overallText}</p>
      <div class="cols" class:single={!report.declines.length}>
        <div>
          <h3>Besser geworden</h3>
          {#if report.improvements.length}
            <ul class="list">
              {#each report.improvements as c (c.dim + c.metric + c.id)}
                {@const [what, detail] = changeParts(c)}
                <li><span>{what}</span><span>{detail}</span></li>
              {/each}
            </ul>
          {:else}
            <p class="empty">Noch keine deutliche Veränderung – dafür braucht es etwas mehr Übung in beiden Wochen.</p>
          {/if}
        </div>
        {#if report.declines.length}
          <div>
            <h3>Im Blick behalten</h3>
            <ul class="list">
              {#each report.declines.slice(0, 3) as c (c.dim + c.metric + c.id)}
                {@const [what, detail] = changeParts(c)}
                <li><span>{what}</span><span>{detail}</span></li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .single {
    grid-template-columns: 1fr;
  }
  .progress .list li span:last-child {
    white-space: nowrap;
  }
</style>
