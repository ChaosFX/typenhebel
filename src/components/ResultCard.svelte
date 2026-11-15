<script lang="ts">
  import { app } from '../app/state.svelte';
  import { fmtTime } from '../ui/format';
  import Insights from './Insights.svelte';
  import Spark from './Spark.svelte';

  let next = $state<HTMLButtonElement>();
  const r = $derived(app.result);
  const badges = $derived(r ? [...(r.perfect ? ['Fehlerfrei'] : []), ...(r.newBest ? ['Neuer Bestwert'] : [])] : []);

  $effect(() => {
    if (r) next?.focus();
  });

  /** Nach dem Sichern verschwindet die Erinnerung von selbst (exportDue wird falsch). */
  function exportNow(): void {
    void app.exportData(true);
    next?.focus();
  }

  function again(): void {
    app.restart();
  }
</script>

<div class="veil" id="resultVeil" hidden={!r}>
  <div class="card" id="resultCard" role="dialog" aria-modal="true" aria-labelledby="resTitle">
    {#if r}
      {@const st = r.stats}
      <h2 id="resTitle">Abschnitt geschafft</h2>
      <div class="sub">{r.sub}</div>
      {#if badges.length}
        <div class="badges">
          {#each badges as b (b)}<span class="badge">{b}</span>{/each}
        </div>
      {/if}
      <div class="big">
        <div><b>{Math.round(st.wpm)}</b><span>WPM netto</span></div>
        <div><b>{(st.accuracy * 100).toFixed(1).replace('.', ',')} %</b><span>Genauigkeit</span></div>
        <div>
          <b>{st.consistency === null ? '–' : Math.round(st.consistency) + ' %'}</b><span>Gleichmäßigkeit</span>
        </div>
        <div><b>{fmtTime(st.durationMs)}</b><span>Zeit</span></div>
      </div>
      <div class="small">
        {`Brutto ${Math.round(st.raw)} WPM · ${st.errors} Fehler · ${st.backspaces} Korrekturen · ` +
          `längste fehlerfreie Serie ${st.bestStreak} · ${Math.round(st.wpm * 5)} Zeichen/min`}
      </div>
      <Spark vals={r.series} />
      <h3>
        {`Auffälligkeiten aus deinem Profil (${r.profileSessions} ${r.profileSessions === 1 ? 'Abschnitt' : 'Abschnitte'})`}
      </h3>
      <Insights a={r.analysis} />
      {#if app.exportDue}
        <p class="remind" id="resRemind">
          {`Seit deiner letzten Sicherung hast du ${app.sessions.length - app.exportedAtSessions} Abschnitte geübt. ` +
            'Browserdaten können verloren gehen – '}<button class="link" id="resExport" onclick={exportNow}
            >jetzt sichern</button
          >.
        </p>
      {/if}
      <div class="actions">
        <button id="resAgain" onclick={again}>Nochmal</button><button
          class="primary"
          id="resNext"
          bind:this={next}
          onclick={() => app.go(1)}>Weiter ↵</button
        >
      </div>
    {/if}
  </div>
</div>
