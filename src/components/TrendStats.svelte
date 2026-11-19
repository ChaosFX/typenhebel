<script lang="ts">
  // Tempo je Übungstag (alle Abschnitte), im Profil-Reiter „Verlauf“
  import { dailyTrend, type DayPoint } from '../core';
  import type { SessionRecord } from '../data/records';
  import { f1 } from '../ui/format';

  let { sessions }: { sessions: readonly SessionRecord[] } = $props();

  const days = $derived(dailyTrend(sessions));
  const maxWpm = $derived(Math.max(1, ...days.map((d) => d.wpm)));
  const dayLabel = (d: string): string => `${Number(d.slice(8))}.${Number(d.slice(5, 7))}.`;
  const dayTitle = (d: DayPoint): string =>
    `${dayLabel(d.day)}: ${Math.round(d.wpm)} WPM, ${f1(d.accuracy * 100)} % Genauigkeit, ` +
    `${d.sessions} ${d.sessions === 1 ? 'Abschnitt' : 'Abschnitte'}`;
</script>

<h3 class="deep-h first">
  Tempo je Tag{#if days.length > 1}{' '}<span class="note">· Median WPM, letzte {days.length} Übungstage</span>{/if}
</h3>
{#if days.length > 1}
  <div class="trend" role="img" aria-label="Tempo je Übungstag">
    {#each days as d (d.day)}
      <div class="day" title={dayTitle(d)}>
        <b>{Math.round(d.wpm)}</b>
        <div class="col"><i style:height="{(d.wpm / maxWpm) * 100}%"></i></div>
        <span>{dayLabel(d.day)}</span>
      </div>
    {/each}
  </div>
{:else}
  <p class="empty">Der Verlauf erscheint ab dem zweiten Übungstag.</p>
{/if}
