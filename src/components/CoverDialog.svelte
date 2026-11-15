<script lang="ts">
  import { coverStyle, coverSvg, LAYOUT_NAMES, LAYOUTS, PALETTES, randomCover, type CoverChoice } from '../core';
  import { app } from '../app/state.svelte';
  import type { BookMeta } from '../data/records';
  import { DEMO } from '../ui/demo';
  import Modal from './Modal.svelte';

  /** Zuletzt bearbeitetes Buch; bleibt nach dem Schließen gesetzt, damit der Fokus zurückfinden kann. */
  let last = $state<string | null>(null);
  const b = $derived(app.allBooks.find((x) => x.id === (app.coverId ?? last)) ?? null);
  const c = $derived<CoverChoice | null>(b ? (app.covers[b.id] ?? coverStyle(b)) : null);
  const info = (x: BookMeta): BookMeta => (x.id === DEMO.id ? { ...x, author: 'Typenhebel' } : x);

  $effect(() => {
    if (app.coverId) last = app.coverId;
  });

  const set = (choice: CoverChoice | null): void => app.setCover(b!.id, choice);

  function closed(): void {
    app.coverId = null;
    if (last) document.querySelector<HTMLElement>(`#shelf [data-cover="${CSS.escape(last)}"]`)?.focus();
  }
</script>

<Modal
  bind:open={
    () => app.coverId !== null,
    (v) => {
      if (!v) app.coverId = null;
    }
  }
  id="coverDlg"
  aria-labelledby="cvH"
  onclosed={closed}
>
  <div class="in">
    <h2 id="cvH">Cover wählen</h2>
    <p class="small" id="cvTitle">{b?.title ?? ''}</p>
    <div class="cv">
      <div class="cv-prev" id="cvPrev">
        {@html b && c ? coverSvg(info(b), c) : ''}
      </div>
      <div class="cv-opts">
        <div class="cv-label">Gestaltung</div>
        <div class="cv-layouts" id="cvLayouts">
          {#if b && c}
            {#each LAYOUTS as l (l)}
              <button
                class="cv-layout"
                data-layout={l}
                aria-pressed={l === c.layout}
                onclick={() => set({ ...c, layout: l })}
                >{@html coverSvg(info(b), { layout: l, palette: c.palette })}<span>{LAYOUT_NAMES[l]}</span></button
              >
            {/each}
          {/if}
        </div>
        <div class="cv-label">Farbe</div>
        <div class="cv-pal" id="cvPal">
          {#if c}
            {#each PALETTES as p (p.name)}
              <button
                class="cv-swatch"
                data-palette={p.name}
                aria-pressed={p.name === c.palette}
                title={p.name}
                aria-label="Farbe {p.name}"
                style:--sw-bg={p.bg}
                style:--sw-ac={p.accent}
                onclick={() => set({ ...c, palette: p.name })}
              ></button>
            {/each}
          {/if}
        </div>
      </div>
    </div>
    <div class="actions">
      <button id="cvReset" onclick={() => set(null)}>Standard</button><button
        id="cvDice"
        onclick={() => set(randomCover(c!))}>Würfeln</button
      ><button class="primary" id="cvDone" onclick={() => (app.coverId = null)}>Fertig</button>
    </div>
  </div>
</Modal>
