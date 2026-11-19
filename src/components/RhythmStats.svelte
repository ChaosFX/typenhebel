<script lang="ts">
  // Rhythmus aus den Rohdaten der letzten Abschnitte (der Tagesverlauf steht in TrendStats)
  import { analyzeRhythm, rhythmAdvice, type SlowGroup } from '../core';
  import type { SessionRecord } from '../data/records';
  import { f1 } from '../ui/format';

  let { sessions }: { sessions: readonly SessionRecord[] } = $props();

  const r = $derived(analyzeRhythm(sessions));
  const advice = $derived(rhythmAdvice(r));
  const show = (k: string): string => k.replace(/ /g, '␣');
  const signed = (ratio: number): string => `${ratio >= 1 ? '+' : ''}${Math.round((ratio - 1) * 100)} %`;
  const postErrorText = $derived(
    r?.postError
      ? `${Math.round(r.postError.afterMs)} ms je Anschlag statt ${Math.round(r.postError.baseMs)} ms ` +
          `(${signed(r.postError.ratio)}, n = ${r.postError.n} Fehler)`
      : null,
  );
  const fatigueText = $derived(
    r?.fatigue
      ? `Letztes Drittel gegenüber dem ersten: ${signed(r.fatigue.tempoRatio)} Zeit je Anschlag, ` +
          `${f1(r.fatigue.lastErr * 100)} % statt ${f1(r.fatigue.firstErr * 100)} % Fehler (n = ${r.fatigue.n} Abschnitte)`
      : null,
  );
  const lists: [string, (x: NonNullable<typeof r>) => SlowGroup[]][] = [
    ['Langsame Dreiergruppen', (x) => x.trigrams],
    ['Wortanfänge', (x) => x.starts],
    ['Wortenden', (x) => x.ends],
  ];
</script>

<div class="rhythm">
  {#if r}
    <h3 class="deep-h">
      Rhythmus <span class="note">· letzte {r.sessions} {r.sessions === 1 ? 'Abschnitt' : 'Abschnitte'}</span>
    </h3>
    <div class="cols">
      <div>
        <h3>Nach einem Fehler</h3>
        {#if postErrorText}
          <p class="small">{postErrorText}</p>
        {:else}
          <p class="empty">Noch zu wenige Fehler für eine Aussage.</p>
        {/if}
        <h3>Im Verlauf eines Abschnitts</h3>
        {#if fatigueText}
          <p class="small">{fatigueText}</p>
        {:else}
          <p class="empty">Ab fünf längeren Abschnitten.</p>
        {/if}
      </div>
      {#each lists as [title, pick] (title)}
        {@const xs = pick(r)}
        <div>
          <h3>{title}</h3>
          {#if xs.length}
            <ul class="list">
              {#each xs as g (g.k)}
                <li>
                  <span class="mono">{show(g.k)}</span><span>{Math.round(g.ms)} ms · ×{f1(g.ratio)} · n = {g.n}</span>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="empty">Nichts Auffälliges.</p>
          {/if}
        </div>
      {/each}
    </div>
    {#each advice as t (t)}<div class="tip">{t}</div>{/each}
  {/if}
</div>
