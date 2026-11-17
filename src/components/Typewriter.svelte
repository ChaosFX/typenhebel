<script lang="ts">
  // Tastatur im Schreibmaschinen-Look unter dem Text. Sie zeigt die nächste Taste (mit Umschalt- bzw. AltGr-Taste)
  // und jeden Anschlag, damit der Blick beim Üben auf dem Bildschirm bleibt. Die Tasten werden hier nur einmal
  // gezeichnet; hervorgehoben und angeschlagen wird imperativ im Tipp-Hotpath (app/typing.svelte.ts) über data-k.
  import { KEYS } from '../core';

  let { hidden, el = $bindable() }: { hidden: boolean; el?: HTMLElement } = $props();

  /** Breite in Tastenbreiten: Zahlenreihe 13 Tasten + Rücktaste 2 */
  const W = 15;
  /** Höhe: 4 Tastenreihen + Leertastenreihe */
  const H = 5;

  /** Zweite Belegung, die über der Grundbelegung steht (nur bei Nicht-Buchstaben) */
  const SHIFTED: Record<string, string> = {
    '^': '°',
    '1': '!',
    '2': '"',
    '3': '§',
    '4': '$',
    '5': '%',
    '6': '&',
    '7': '/',
    '8': '(',
    '9': ')',
    '0': '=',
    ß: '?',
    '´': '`',
    '+': '*',
    '#': "'",
    '<': '>',
    ',': ';',
    '.': ':',
    '-': '_',
  };
  const isLetter = (c: string): boolean => /\p{L}/u.test(c) && c !== 'ß';

  interface Cap {
    k: string;
    x: number;
    row: number;
    /** Breite in Tastenbreiten (runde Tasten: 1) */
    w: number;
    top?: string;
    label: string;
    /** Sondertaste als Leiste statt rund */
    wide?: boolean;
    /** nur Zierde, wird nie gebraucht */
    idle?: boolean;
  }

  const caps: Cap[] = [
    ...KEYS.filter((k) => k.row < 4).map((k): Cap => ({
      k: k.base,
      x: k.x,
      row: k.row,
      w: 1,
      top: isLetter(k.base) ? undefined : SHIFTED[k.base],
      label: isLetter(k.base) ? k.base.toUpperCase() : k.base,
    })),
    { k: 'bs', x: 14, row: 0, w: 1.7, label: '⟵', wide: true },
    { k: 'tab', x: 0.75, row: 1, w: 1.3, label: '⇥', wide: true, idle: true },
    { k: 'ret', x: 14.25, row: 1, w: 1.3, label: '↵', wide: true, idle: true },
    { k: 'lock', x: 0.875, row: 2, w: 1.5, label: '⇩', wide: true, idle: true },
    { k: 'shiftL', x: 0.625, row: 3, w: 1.1, label: '⇧', wide: true },
    { k: 'shiftR', x: 13.625, row: 3, w: 2.5, label: '⇧', wide: true },
    { k: 'altgr', x: 11.75, row: 4, w: 1.5, label: 'AltGr', wide: true },
  ];
</script>

<div class="typewriter" {hidden} aria-hidden="true" bind:this={el}>
  <div class="tw-deck">
    {#each caps as c (c.k)}
      <span
        class="tw-key"
        class:wide={c.wide}
        class:idle={c.idle}
        class:home={c.k === 'f' || c.k === 'j'}
        data-k={c.k}
        style:left="{((c.x - c.w / 2) / W) * 100}%"
        style:top="{(c.row / H) * 100}%"
        style:width="{(c.w / W) * 100}%"
      >
        <span class="tw-cap">
          {#if c.top}<small>{c.top}</small>{/if}{c.label}
        </span>
      </span>
    {/each}
    <span
      class="tw-key tw-space"
      data-k=" "
      style:left="{(3.25 / W) * 100}%"
      style:top="{(4 / H) * 100}%"
      style:width="{(7.5 / W) * 100}%"
    >
      <span class="tw-cap"></span>
    </span>
  </div>
  <div class="tw-finger" data-finger></div>
</div>
