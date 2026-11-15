<script lang="ts">
  // Fehlerarten aus den Rohdaten der letzten Abschnitte (ältere Abschnitte haben keine Tastenereignisse mehr)
  import { classifyErrors, countErrorKinds, ERROR_KIND_NAMES, type ErrorKind } from '../core';
  import type { SessionRecord } from '../data/records';
  import { f1 } from '../ui/format';

  let { sessions }: { sessions: readonly SessionRecord[] } = $props();

  const withEvents = $derived(sessions.filter((s) => s.events?.length));
  const counts = $derived(countErrorKinds(withEvents.flatMap((s) => classifyErrors(s.events!))));
  const total = $derived(Object.values(counts).reduce((a, b) => a + b, 0));
  const rows = $derived(
    (Object.entries(counts) as [ErrorKind, number][]).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]),
  );
  const max = $derived(Math.max(1, ...rows.map(([, n]) => n)));
</script>

<div class="error-kinds">
  <h3>
    Fehlerarten{#if withEvents.length}{' '}<span class="note"
        >· letzte {withEvents.length} {withEvents.length === 1 ? 'Abschnitt' : 'Abschnitte'}, {total} Fehler</span
      >{/if}
  </h3>
  {#each rows as [kind, n] (kind)}
    <div class="cat">
      <span>{ERROR_KIND_NAMES[kind]}</span>
      <div class="meter"><i style:width="{(n / max) * 100}%"></i></div>
      <b>{f1((n / total) * 100)} %</b>
    </div>
  {:else}
    <p class="empty">{withEvents.length ? 'Keine Fehler in den letzten Abschnitten.' : 'Noch keine Daten.'}</p>
  {/each}
</div>
