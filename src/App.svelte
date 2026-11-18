<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { chapterOf, chapterRange } from './core';
  import { app, hasChapters, TEXT_SCALE, TRAINING_ID } from './app/state.svelte';
  import { Typing } from './app/typing.svelte';
  import CoverDialog from './components/CoverDialog.svelte';
  import LibraryDialog from './components/LibraryDialog.svelte';
  import LoadDialog from './components/LoadDialog.svelte';
  import ProfileDialog from './components/ProfileDialog.svelte';
  import ResultCard from './components/ResultCard.svelte';
  import SettingsPanel from './components/SettingsPanel.svelte';
  import Typewriter from './components/Typewriter.svelte';

  let textEl: HTMLElement;
  let inp: HTMLTextAreaElement;
  let bar: HTMLElement;
  let streak: HTMLElement;
  let setBtn = $state<HTMLElement>();
  let kb = $state<HTMLElement>();
  let typing = $state<Typing | null>(null);

  onMount(() => {
    app.inp = inp;
    typing = new Typing({ text: textEl, inp, bar, streak, kb });
    const timer = setInterval(() => typing?.tick(), 400);
    return () => clearInterval(timer);
  });

  // Neuer Abschnitt (jeder Neustart erzeugt eine neue Session) → Text aufbauen und Eingabe fokussieren
  $effect(() => {
    const sess = app.sess;
    const t = typing;
    if (!t || !sess) return;
    untrack(() => {
      t.render(sess, app.book.sections[app.secIdx]);
      app.focusInput();
    });
  });

  const kbVisible = $derived(
    app.settings.keyboard === 'always' || (app.settings.keyboard === 'training' && app.book.id === TRAINING_ID),
  );
  $effect(() => {
    typing?.setKeyboard(kbVisible);
  });

  $effect(() => {
    document.documentElement.dataset.theme = app.settings.theme;
  });
  $effect(() => {
    document.documentElement.dataset.caret = app.settings.caret;
  });
  $effect(() => {
    document.documentElement.style.setProperty('--fs-scale', String(TEXT_SCALE[app.settings.textSize]));
  });

  // Bis der gespeicherte Stand geladen ist, bleibt die Kopfzeile leer (sonst wirkt die App schon bedienbar).
  const ready = $derived(app.sess !== null);

  /** Kapitelauswahl: Titel, Häkchen und Stand je Kapitel */
  const chapters = $derived.by(() => {
    const b = app.book;
    if (!hasChapters(b)) return [];
    const ds = app.doneSet(b.id);
    return b.chapters!.map((ch, i) => {
      const [start, end] = chapterRange(b, i);
      let finished = 0;
      for (let j = start; j < end; j++) if (ds.has(j)) finished++;
      return `${finished === end - start ? '✓ ' : ''}${ch.title} · ${finished}/${end - start}`;
    });
  });

  function toggleMode(): void {
    app.settings.strict = !app.settings.strict;
    app.saveSettings();
    app.restart();
  }
  const live = $derived(typing?.live ?? { wpm: '0', acc: '100 %', streak: '0', time: '0:00' });
</script>

<div class="app">
  <div class="brand">
    <svg class="mark" viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <mask id="armMask" maskUnits="userSpaceOnUse">
          <rect width="48" height="48" fill="#fff" />
          <path d="M3 44.5 H8 C19 44.5 25.5 35 32 16" fill="none" stroke="#000" stroke-width="2.2" />
        </mask>
      </defs>
      <path class="arm" d="M3 44.5 H8 C19 44.5 25.5 35 32 16" fill="none" stroke-width="6" mask="url(#armMask)" />
      <g transform="rotate(22 33.5 11)">
        <rect class="head" x="27.5" y="4.5" width="12" height="13" rx="2.6" stroke-width="1.9" />
        <text class="t" x="33.5" y="14.6" text-anchor="middle">T</text>
      </g>
      <circle class="dot" cx="39.6" cy="15.6" r="2.8" />
    </svg>
    <span class="brand-name">Typenhebel</span>
    <nav class="mainnav" aria-label="Hauptmenü">
      <button id="libBtn" class="lib" onclick={() => (app.libOpen = true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5.5C4 4.7 4.7 4 5.5 4H10v16H5.5c-.8 0-1.5-.7-1.5-1.5z" />
          <path d="M10 4h4v16h-4z" />
          <path d="m15.2 5.1 3.6-1 3.9 14.6-3.6 1z" />
        </svg>
        Bibliothek
      </button>
      <button id="trainBtn" disabled={app.training} onclick={() => void app.openTraining()}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 12h0.01" />
        </svg>
        Training
      </button>
      <button id="profBtn" onclick={() => (app.profOpen = true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 20h16" />
          <path d="M7 16v-5" />
          <path d="M12 16V6" />
          <path d="M17 16v-8" />
        </svg>
        Profil
      </button>
    </nav>
  </div>
  <header class="top">
    <div class="book">
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (Bibliothek ist auch per Knopf erreichbar) -->
      <div class="bt" id="bookTitle" onclick={() => (app.libOpen = true)}>{ready ? app.book.title : ''}</div>
      <div class="ba" id="bookAuthor">
        {ready ? (app.book.sections[app.secIdx]?.note ?? app.book.author) || '' : ''}
      </div>
    </div>
    <nav class="nav" aria-label="Abschnitte">
      <select
        id="chapSel"
        class="chap"
        aria-label="Kapitel"
        title="Kapitel wählen"
        hidden={chapters.length === 0}
        value={chapters.length ? String(chapterOf(app.book, app.secIdx)) : ''}
        onchange={(e) => app.openChapter(Number(e.currentTarget.value))}
      >
        {#each chapters as label, i (i)}
          <option value={String(i)}>{label}</option>
        {/each}
      </select>
      <button id="prev" title="Vorheriger Abschnitt" aria-label="Vorheriger Abschnitt" onclick={() => app.go(-1)}
        >‹</button
      >
      <span id="secInfo">{ready ? `Abschnitt ${app.sectionPos[0]} / ${app.sectionPos[1]}` : ''}</span>
      <button id="next" title="Nächster Abschnitt" aria-label="Nächster Abschnitt" onclick={() => app.go(1)}>›</button>
    </nav>
    <div class="tools">
      <button
        id="modeBtn"
        title={app.settings.strict
          ? 'Strikt: Der Cursor wartet auf das richtige Zeichen.'
          : 'Frei: Fehler bleiben stehen und müssen mit ⌫ korrigiert werden.'}
        onclick={toggleMode}>{app.settings.strict ? 'Modus: Strikt' : 'Modus: Frei'}</button
      >
      <button
        id="setBtn"
        aria-expanded={app.setOpen}
        aria-controls="setDlg"
        bind:this={setBtn}
        onclick={() => (app.setOpen = !app.setOpen)}>Einstellungen</button
      >
      <SettingsPanel anchor={setBtn} />
    </div>
  </header>

  <div class="bar" aria-hidden="true"><i id="barFill" bind:this={bar}></i></div>
  <div class="live" aria-hidden="true">
    <span>Tempo<b id="lWpm">{live.wpm}</b></span>
    <span>Genauigkeit<b id="lAcc">{live.acc}</b></span>
    <span>Serie<b id="lStreak" bind:this={streak}>{live.streak}</b></span>
    <span>Zeit<b id="lTime">{live.time}</b></span>
  </div>

  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions (Klick holt nur den Fokus zurück) -->
  <main class="sheet" id="sheet" onclick={() => app.focusInput()}>
    <div class="text" id="text" aria-label="Abzutippender Text" bind:this={textEl}></div>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="mask" id="mask" hidden={!app.masked} onclick={() => app.focusInput()}>
      Klicke hierher, um weiterzutippen
    </div>
  </main>
  <div class="hint" id="hint" role="status">{app.hint}</div>
  <Typewriter hidden={!kbVisible} bind:el={kb} />
  <div class="foot">
    <span><kbd>Esc</kbd> Abschnitt neu starten</span>
    <span><kbd>⌫</kbd> korrigieren (nur im Modus „Frei“)</span>
    <span><kbd>↵</kbd> weiter nach dem Abschnitt</span>
  </div>
</div>

<textarea
  id="inp"
  aria-label="Eingabefeld zum Abtippen"
  autocomplete="off"
  autocapitalize="off"
  {...{ autocorrect: 'off' }}
  spellcheck="false"
  bind:this={inp}></textarea>

<ResultCard />
<LoadDialog />
<LibraryDialog />
<CoverDialog />
<ProfileDialog />
