<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { coverStyle, coverSvg, type CoverChoice } from '../core';
  import { app, DEMO_META, hasChapters } from '../app/state.svelte';
  import { checkCorpusBook, CORPUS_PREFIX, parseCorpusIndex, type CorpusEntry } from '../data/corpus';
  import { deleteBook } from '../data/db';
  import type { BookMeta } from '../data/records';
  import { DEMO } from '../ui/demo';
  import Modal from './Modal.svelte';

  let shelf: HTMLUListElement;
  let msg = $state('');

  const coverOf = (b: BookMeta): CoverChoice => app.covers[b.id] ?? coverStyle(b);
  /** Angaben fürs Cover; der Demotext trägt im Autorfeld einen Hinweis, auf dem Cover steht „Typenhebel“. */
  const coverInfo = (b: BookMeta): BookMeta => (b.id === DEMO.id ? { ...b, author: 'Typenhebel' } : b);

  function bookProgress(b: BookMeta): string {
    const parts = [];
    if (hasChapters(b)) parts.push(`${b.chapters!.length} Kapitel`);
    parts.push(`${b.sectionCount} Abschnitte`);
    if (app.doneSet(b.id).size) parts.push(`${app.percentDone(b)} % geschafft`);
    return parts.join(' · ');
  }

  // ---------- Mitgelieferte Bücher (public/corpus/) ----------
  let corpus = $state.raw<CorpusEntry[] | null>(null);
  const installing = new SvelteSet<string>();
  const avail = $derived.by(() => {
    const owned = new Set(app.books.map((b) => b.id));
    return (corpus ?? []).filter((c) => !owned.has(c.id));
  });

  /** Index der mitgelieferten Bücher laden (gleiche Herkunft, keine externe Anfrage). */
  async function loadCorpus(): Promise<void> {
    if (corpus) return;
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}corpus/index.json`);
      corpus = r.ok ? parseCorpusIndex(await r.json()) : [];
    } catch {
      corpus = [];
    }
  }

  async function install(c: CorpusEntry): Promise<void> {
    if (installing.has(c.id)) return;
    installing.add(c.id);
    msg = '';
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}corpus/${c.file}`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const b = checkCorpusBook(await r.json(), c);
      const err = await app.saveBook(b);
      if (err) msg = err;
      else {
        app.libOpen = false;
        await app.openBook(b.id, 0);
      }
    } catch (e) {
      console.error(e);
      msg = 'Das Buch konnte nicht geladen werden. Bitte später noch einmal versuchen.';
    } finally {
      installing.delete(c.id);
    }
  }

  const fmtNum = (n: number): string => n.toLocaleString('de-DE');
  const availMeta = (c: CorpusEntry): BookMeta => ({
    id: c.id,
    title: c.title,
    author: c.author,
    sectionCount: c.sections,
  });

  function onOpen(): HTMLElement | null {
    msg = '';
    void loadCorpus();
    return shelf.querySelector<HTMLElement>('.current .cover');
  }

  function open(id: string): void {
    app.libOpen = false;
    void app.openBook(id);
  }

  function remove(id: string): void {
    const b = app.books.find((x) => x.id === id);
    if (!b || !confirm(`„${b.title}“ wirklich löschen? Der Fortschritt darin geht verloren, dein Profil bleibt.`))
      return;
    (app.db ? deleteBook(app.db, id) : Promise.resolve()).then(
      () => app.forgetBook(id),
      (err: unknown) => {
        console.error(err);
        alert('Der Text konnte nicht gelöscht werden.');
      },
    );
  }
</script>

<Modal
  bind:open={app.libOpen}
  id="libDlg"
  class="wide"
  aria-labelledby="libH"
  initialFocus={onOpen}
  onclosed={() => app.focusInput()}
>
  <div class="in">
    <div class="lib-head">
      <h2 id="libH">Bibliothek</h2>
      <button class="primary" id="libClose" onclick={() => (app.libOpen = false)}>Schließen</button>
    </div>
    <div class={msg ? 'msg err' : 'msg'} id="libMsg" role="status">{msg}</div>
    <ul class="shelf" id="shelf" bind:this={shelf}>
      {#each app.allBooks as b (b.id)}
        {@const pct = app.percentDone(b)}
        {@const cur = b.id === app.book.id}
        {@const author = b.id === DEMO.id ? 'Zum Ausprobieren' : b.author}
        <li class="shelf-item" class:current={cur}>
          <button class="cover" data-open={b.id} aria-label="{b.title} öffnen" onclick={() => open(b.id)}
            >{@html coverSvg(coverInfo(b), coverOf(b))}</button
          >
          <div class="shelf-meta">
            {#if cur}<span class="now">Gerade offen</span>{/if}
            <b>{b.title}</b>
            {#if author}<span class="who">{author}</span>{/if}
            <div
              class="meter"
              role="progressbar"
              aria-label="Fortschritt"
              aria-valuenow={pct}
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <i style:width="{pct}%"></i>
            </div>
            <small>{bookProgress(b)}</small>
            {#if b.id.startsWith(CORPUS_PREFIX) && b.source}<small class="src">Quelle: {b.source.name}</small>{/if}
            <div class="shelf-actions">
              <button class="link" data-cover={b.id} onclick={() => (app.coverId = b.id)}>Cover ändern</button>
              {#if b.id !== DEMO_META.id}
                <button class="link" data-del={b.id} onclick={() => remove(b.id)}>Löschen</button>
              {/if}
            </div>
          </div>
        </li>
      {/each}
      <li class="shelf-item">
        <button class="cover add" id="libLoad" onclick={() => (app.loadOpen = true)}><span>+</span>Text laden</button>
        <div class="shelf-meta"><small>EPUB oder TXT aus deiner Sammlung, z. B. von projekt-gutenberg.org</small></div>
      </li>
    </ul>
    <h3 class="shelf-h" id="availH" hidden={avail.length === 0}>Mitgeliefert – mit einem Klick laden</h3>
    <ul class="shelf" id="avail">
      {#each avail as c (c.id)}
        {@const busy = installing.has(c.id)}
        {@const meta = availMeta(c)}
        <li class="shelf-item avail" class:busy>
          <button
            class="cover"
            data-install={c.id}
            aria-label="{c.title} laden"
            disabled={busy}
            onclick={() => install(c)}
            >{@html coverSvg(meta, coverOf(meta))}<span class="get">{busy ? 'Wird geladen …' : 'Laden'}</span></button
          >
          <div class="shelf-meta">
            <b>{c.title}</b>
            <span class="who">{c.author}</span>
            <small
              >{c.chapters > 1 ? c.chapters + ' Kapitel · ' : ''}{fmtNum(c.words)} Wörter · {(
                c.bytes / 1e6
              ).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB</small
            >
            <small class="src">Quelle: {c.source.name}</small>
          </div>
        </li>
      {/each}
    </ul>
  </div>
</Modal>
