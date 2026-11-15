<script lang="ts">
  // Tempo und Fehler je Finger und Hand, dazu Empfehlungen mit Begründung
  import { fingerAdvice, type FingerAnalysis, type GroupStat } from '../core';
  import { f1 } from '../ui/format';

  let { a }: { a: FingerAnalysis } = $props();

  const advice = $derived(fingerAdvice(a));
  const pct = (g: GroupStat): string => f1((g.errors / Math.max(1, g.n)) * 100) + ' %';
  const ms = (g: GroupStat): string => (g.ms === null ? '–' : Math.round(g.ms) + ' ms');
</script>

<div>
  <h3>Finger und Hände</h3>
  <table class="finger-table">
    <thead>
      <tr><th>Finger</th><th>Anschläge</th><th>Fehler</th><th>Ø Abstand</th></tr>
    </thead>
    <tbody>
      {#each [...a.fingers, ...a.hands] as g (g.id)}
        <tr class:hand={g.id === 'left' || g.id === 'right'} class:hand-first={g.id === 'left'}>
          <td>{g.label}</td>
          <td>{g.n}</td>
          <td class:weak={g.errorProne}>{pct(g)}</td>
          <td class:weak={g.slow}>{ms(g)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <p class="small">
    Ø über alle Tasten: {f1(a.rate * 100)} % Fehler, {Math.round(a.meanMs)} ms zwischen zwei Anschlägen. Rot markiert ist
    nur, was mit genug Anschlägen deutlich abweicht.
  </p>
  {#each advice as t (t)}<div class="tip">{t}</div>{/each}
</div>
