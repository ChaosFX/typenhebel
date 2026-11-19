<script lang="ts">
  // Auffälligkeiten aus dem Profil (Ergebniskarte und Profil-Dialog)
  import { hint, type Analysis } from '../core';
  import { f1, showCh } from '../ui/format';

  /** showTip: im Profil steht der Hinweis schon im Überblick */
  let { a, showTip = true }: { a: Analysis | null; showTip?: boolean } = $props();
  const cap = $derived(a ? Math.max(0.1, ...a.cats.map((c) => c.rate)) : 0.1);
  const tip = $derived(a ? hint(a) : null);
</script>

{#if !a}
  <p class="empty">Noch keine Daten.</p>
{:else}
  <div class="cols">
    <div>
      <h3>
        Langsame Kombinationen{#if a.n < 3000}{' '}<span class="note">· vorläufig ({a.n} Anschläge)</span>{/if}
      </h3>
      {#if a.slow.length}
        <ul class="list">
          {#each a.slow as x (x.k)}
            <li>
              <span class="mono">{x.k.replace(/ /g, '␣')}</span><span>{Math.round(x.ms)} ms · ×{f1(x.ratio)}</span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="empty">Noch nichts Auffälliges.</p>
      {/if}
    </div>
    <div>
      <h3>Fehleranfällige Zeichen</h3>
      {#if a.errChars.length}
        <ul class="list">
          {#each a.errChars as x (x.k)}
            <li>
              <span class="mono">{showCh(x.k)}</span><span>{x.e} von {x.n} · {Math.round(x.rate * 100)} %</span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="empty">Keine wiederkehrenden Fehler.</p>
      {/if}
    </div>
    <div>
      <h3>Verwechslungen</h3>
      {#if a.conf.length}
        <ul class="list">
          {#each a.conf as x (x.exp + x.got)}
            <li>
              <span
                >soll <span class="mono">{showCh(x.exp)}</span> · getippt
                <span class="mono">{showCh(x.got)}</span></span
              ><span>{x.n}×</span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="empty">Keine Fehler – stark.</p>
      {/if}
    </div>
    <div>
      <h3>Fehlerquote nach Zeichenart</h3>
      {#each a.cats as c (c.k)}
        <div class="cat">
          <span>{c.k}</span>
          <div class="meter"><i style:width="{Math.min(100, (c.rate / cap) * 100)}%"></i></div>
          <b>{(c.rate * 100).toFixed(1).replace('.', ',')} %</b>
        </div>
      {:else}
        <p class="empty">Noch zu wenig Daten.</p>
      {/each}
    </div>
  </div>
  {#if tip && showTip}<div class="tip">{tip}</div>{/if}
{/if}
