<script lang="ts">
  import { cleanParagraph, findRare, prepare, replaceRare, segment, wc, type Book, type RareChar } from '../core';
  import { app } from '../app/state.svelte';
  import { epubEdition, epubToBook, EpubError, readEpub, type EpubBook } from '../epub/import';
  import Modal from './Modal.svelte';

  let fileInput: HTMLInputElement;
  let title = $state('');
  let author = $state('');
  let text = $state('');
  /** Ausgewähltes, aber noch nicht geladenes EPUB */
  let pendingEpub = $state.raw<{ book: EpubBook; file: string } | null>(null);
  let info = $state('');
  let rareFound = $state.raw<RareChar[]>([]);
  let replace = $state(true);
  let msg = $state('');
  let msgErr = $state(false);
  let busy = $state(false);

  const RARE_SHOWN = 14;
  const stuck = $derived(rareFound.some((r) => r.replacement === null));

  function showRare(texts: Iterable<string>): void {
    rareFound = findRare(texts);
  }

  function error(t: string): void {
    msgErr = true;
    msg = t;
  }

  function reset(): void {
    pendingEpub = null;
    rareFound = [];
    text = '';
    title = '';
    author = '';
    fileInput.value = '';
    info = '';
    replace = true;
  }

  async function onFile(): Promise<void> {
    const f = fileInput.files?.[0];
    pendingEpub = null;
    info = '';
    rareFound = [];
    msgErr = false;
    msg = '';
    if (!f) return;
    if (!/\.epub$/i.test(f.name) && f.type !== 'application/epub+zip') {
      text = await f.text();
      if (!title) title = f.name.replace(/\.[^.]+$/, '');
      showRare(prepare(text).paragraphs);
      return;
    }
    try {
      const eb = readEpub(new Uint8Array(await f.arrayBuffer()));
      pendingEpub = { book: eb, file: f.name };
      title = eb.title;
      author = eb.author;
      text = '';
      const paras = eb.chapters.flatMap((c) => c.paragraphs.map(cleanParagraph));
      const words = paras.reduce((a, p) => a + wc(p), 0);
      const ed = epubEdition(eb) ?? '';
      const nCh = eb.chapters.filter((c) => c.paragraphs.length).length;
      info =
        `EPUB erkannt: ${nCh} Kapitel, ${words.toLocaleString('de-DE')} Wörter${ed ? ' · Ausgabe: ' + ed : ''}`.replace(
          /\.?$/,
          '.',
        );
      showRare(paras);
    } catch (err) {
      fileInput.value = '';
      error(err instanceof EpubError ? err.message : 'Die Datei konnte nicht gelesen werden.');
    }
  }

  let rareTimer = 0;
  function onText(): void {
    clearTimeout(rareTimer);
    rareTimer = window.setTimeout(() => {
      if (!pendingEpub) showRare(prepare(text).paragraphs);
    }, 300);
  }

  async function load(): Promise<void> {
    msgErr = false;
    clearTimeout(rareTimer);
    if (!pendingEpub) showRare(prepare(text).paragraphs);
    const doReplace = replace && rareFound.length > 0;
    const id = 'b' + Date.now().toString(36);
    let b: Book;
    let words: number;
    if (pendingEpub) {
      const eb = pendingEpub.book;
      const made = epubToBook(eb, {
        id,
        title: title.trim(),
        author: author.trim(),
        source: { name: pendingEpub.file, edition: epubEdition(eb) },
        replace: doReplace,
      });
      if (!made) return error('Im EPUB wurde kein Text gefunden.');
      b = made;
      words = b.sections.reduce((a, s) => a + wc(s.text), 0);
    } else {
      if (text.trim().length < 200)
        return error('Bitte mindestens ein paar Absätze Text einfügen oder ein EPUB wählen.');
      const p = prepare(text);
      const paras = doReplace ? p.paragraphs.map(replaceRare) : p.paragraphs;
      const secs = segment(paras);
      if (!secs.length) return error('Im Text wurden keine Absätze gefunden.');
      b = {
        id,
        title: title.trim() || p.headings[0] || 'Ohne Titel',
        author: author.trim(),
        sections: secs,
        created: Date.now(),
      };
      words = paras.reduce((a, x) => a + wc(x), 0);
    }
    busy = true;
    const err = await app.saveBook(b).finally(() => (busy = false));
    if (err) return error(err);
    const chapters = b.chapters ? `${b.chapters.length} Kapitel, ` : '';
    reset();
    msg = `${chapters}${b.sections.length} Abschnitte, ${words.toLocaleString('de-DE')} Wörter geladen.`;
    app.loadOpen = false;
    app.libOpen = false;
    void app.openBook(b.id, 0);
  }
</script>

<Modal
  bind:open={app.loadOpen}
  id="loadDlg"
  initialFocus={() => {
    msg = '';
    return null;
  }}
  onclosed={() => app.focusInput()}
>
  <div class="in">
    <h2>Text laden</h2>
    <p class="small">
      Lade ein Buch als <code>.epub</code> (z. B. von projekt-gutenberg.org oder Wikisource) oder als
      <code>.txt</code> – oder füge Text direkt ein. Kapitel werden erkannt, Fußnoten und Seitenzahlen entfernt, der Text
      wird in Abschnitte geteilt. Alles bleibt in deinem Browser.
    </p>
    <label for="ldTitle">Titel</label><input
      type="text"
      id="ldTitle"
      placeholder="z. B. Die Welt von Gestern – Vorwort"
      bind:value={title}
    />
    <label for="ldAuthor">Autor</label><input
      type="text"
      id="ldAuthor"
      placeholder="z. B. Stefan Zweig"
      bind:value={author}
    />
    <label for="ldFile">Datei (.epub oder .txt)</label><input
      type="file"
      id="ldFile"
      accept=".epub,.txt,application/epub+zip,text/plain"
      bind:this={fileInput}
      onchange={onFile}
    />
    <div class="small ldinfo" id="ldInfo" hidden={!info}>{info}</div>
    <label for="ldText">… oder Text einfügen</label><textarea
      class="paste"
      id="ldText"
      spellcheck="false"
      disabled={!!pendingEpub}
      placeholder={pendingEpub ? 'Der Text kommt aus der EPUB-Datei.' : ''}
      bind:value={text}
      oninput={onText}></textarea>
    <div class="rare" id="ldRare" hidden={rareFound.length === 0}>
      <div class="small" id="ldRareList">
        Seltene Zeichen, schwer erreichbar auf deutscher Tastatur:{' '}
        {#each rareFound.slice(0, RARE_SHOWN) as r, i (r.ch)}{i ? ' · ' : ''}<span class="mono">{r.ch}</span>{' '}
          {#if r.replacement === null}<i>(kein Ersatz)</i>{:else}→ <span class="mono">{r.replacement}</span
            >{/if}{` (${r.n}×)`}
        {/each}{rareFound.length > RARE_SHOWN ? ` und ${rareFound.length - RARE_SHOWN} weitere` : ''}.{stuck
          ? ' Zeichen ohne Ersatz lassen sich auf einer deutschen Tastatur kaum tippen.'
          : ''}
      </div>
      <label class="check"
        ><input type="checkbox" id="ldReplace" bind:checked={replace} /> Seltene Zeichen beim Laden ersetzen</label
      >
    </div>
    <div class={msgErr ? 'msg err' : 'msg'} id="ldMsg" role="status">{msg}</div>
    <div class="actions">
      <button id="ldClose" onclick={() => (app.loadOpen = false)}>Schließen</button><button
        class="primary"
        id="ldGo"
        disabled={busy}
        onclick={load}>Laden</button
      >
    </div>
  </div>
</Modal>
