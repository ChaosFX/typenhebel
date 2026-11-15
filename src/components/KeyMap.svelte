<script lang="ts">
  // Tastatur-Wärmebild: je dunkler, desto mehr Fehler (geglättet); Tasten ohne Anschläge bleiben blass
  import { KEYS, type FingerAnalysis, type KeyStat } from '../core';

  let { a }: { a: FingerAnalysis } = $props();

  /** Rechte Kante der breitesten Reihe in Tastenbreiten (Grundreihe: 1,75 + 12) */
  const WIDTH = 13.75;
  const stats = $derived(new Map<string, KeyStat>(a.keys.map((k) => [k.key.base, k])));
  const maxRate = $derived(Math.max(a.rate * 2, ...a.keys.map((k) => k.rate)));
  const heat = (rate: number): number => Math.round(Math.min(1, rate / maxRate) * 70);
  const label = (b: string): string => (b === ' ' || b === 'ß' ? b : b.toUpperCase());
</script>

<div class="keymap" role="img" aria-label="Fehler je Taste: je dunkler, desto mehr Fehler">
  {#each KEYS as k (k.base)}
    {@const s = stats.get(k.base)}
    {@const space = k.row === 4}
    <span
      class="key"
      class:space
      class:nodata={!s}
      style:left="{((space ? 3.75 : k.x - 0.5) / WIDTH) * 100}%"
      style:top="{k.row * 20}%"
      style:width="{((space ? 6.5 : 1) / WIDTH) * 100}%"
      style:--heat="{s ? heat(s.rate) : 0}%"
      title="{space ? 'Leertaste' : k.base}: {s ? `${s.errors} Fehler bei ${s.n} Anschlägen` : 'noch nicht getippt'}"
      >{label(k.base)}</span
    >
  {/each}
</div>
