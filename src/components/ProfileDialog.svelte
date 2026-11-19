<script lang="ts">
  import { analyze, analyzeFingers } from '../core';
  import { app, storageWarning } from '../app/state.svelte';
  import { clearHistory, importJson, isQuotaError } from '../data/db';
  import { ImportError } from '../data/records';
  import { round1 } from '../ui/format';
  import ErrorKinds from './ErrorKinds.svelte';
  import FingerStats from './FingerStats.svelte';
  import KeyMap from './KeyMap.svelte';
  import Insights from './Insights.svelte';
  import ProfileOverview from './ProfileOverview.svelte';
  import RhythmStats from './RhythmStats.svelte';
  import TrendStats from './TrendStats.svelte';
  import Modal from './Modal.svelte';
  import type { ProfileTab } from '../app/state.svelte';

  let fileInput: HTMLInputElement;
  let withBooks = $state(true);
  let msg = $state('');
  let msgErr = $state(false);

  const TABS: [ProfileTab, string][] = [
    ['overview', 'Überblick'],
    ['keys', 'Tasten'],
    ['history', 'Verlauf'],
    ['backup', 'Sichern'],
  ];
  const tabEls: Record<string, HTMLButtonElement> = {};

  // Nur berechnen, solange der Dialog offen ist und der Reiter es braucht
  const tab = $derived(app.profTab);
  const analysis = $derived(app.profOpen && (tab === 'overview' || tab === 'keys') ? analyze(app.profile) : null);
  const fingers = $derived(app.profOpen && tab === 'keys' ? analyzeFingers(app.profile) : null);
  const last = $derived(app.sessions.slice(-10).reverse());
  const since = $derived(app.sessions.length - app.exportedAtSessions);
  const plural = (n: number): string => (n === 1 ? 'Abschnitt' : 'Abschnitte');

  function select(t: ProfileTab, focus = false): void {
    app.profTab = t;
    if (focus) tabEls[t]?.focus();
  }

  /** Pfeiltasten, Pos1 und Ende wechseln den Reiter (ARIA-Muster „Tabs“ mit automatischer Aktivierung) */
  function onTabKey(e: KeyboardEvent): void {
    const i = TABS.findIndex(([t]) => t === tab);
    const n = TABS.length;
    const j =
      e.key === 'ArrowRight'
        ? (i + 1) % n
        : e.key === 'ArrowLeft'
          ? (i - 1 + n) % n
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : -1;
    if (j < 0) return;
    e.preventDefault();
    select(TABS[j]![0], true);
  }

  function message(text: string, err = false): void {
    msgErr = err;
    msg = text;
  }

  function exportNow(): void {
    app.exportData(withBooks).then(
      () => message('Sicherung gespeichert.'),
      (e: unknown) => {
        console.error(e);
        message('Die Sicherung konnte nicht erstellt werden.', true);
      },
    );
  }

  async function onFile(): Promise<void> {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f) return;
    if (!app.db) return message('Ohne dauerhafte Speicherung ist kein Import möglich.', true);
    try {
      const r = await importJson(app.db, await f.text());
      await app.reloadState();
      const parts = [`${r.sessions.length} ${plural(r.sessions.length)} übernommen`];
      if (r.books.length) parts.push(`${r.books.length} ${r.books.length === 1 ? 'Buch' : 'Bücher'}`);
      if (r.duplicates) parts.push(`${r.duplicates} schon vorhanden`);
      let m = parts.join(', ') + '.';
      if (r.unprofiled) m += ` ${r.unprofiled} ältere Abschnitte ohne Rohdaten fließen nicht ins Profil ein.`;
      message(m);
    } catch (err) {
      console.error(err);
      if (err instanceof ImportError) message(err.message, true);
      else message(isQuotaError(err) ? storageWarning(err) : 'Die Datei konnte nicht importiert werden.', true);
    }
  }

  async function reset(): Promise<void> {
    if (!confirm('Profil und Verlauf wirklich löschen? Deine geladenen Texte bleiben erhalten.')) return;
    try {
      if (app.db) await clearHistory(app.db);
      app.resetHistory();
    } catch (e) {
      console.error(e);
      message('Löschen ist fehlgeschlagen.', true);
    }
  }
</script>

<Modal
  bind:open={app.profOpen}
  id="profDlg"
  aria-labelledby="profTitle"
  initialFocus={() => {
    msg = '';
    return tabEls[app.profTab];
  }}
  onclosed={() => app.focusInput()}
>
  <div class="in">
    <h2 id="profTitle">Dein Profil</h2>
    <p class="small" id="profSummary">
      {`${app.profile.sessions} ${plural(app.profile.sessions)} · ${app.profile.n} Anschläge ausgewertet.`}
    </p>
    <div class="tabs" role="tablist" aria-label="Bereiche des Profils">
      {#each TABS as [t, label] (t)}
        <button
          role="tab"
          id={'profTab-' + t}
          aria-selected={tab === t}
          aria-controls="profPanel"
          tabindex={tab === t ? 0 : -1}
          bind:this={tabEls[t]}
          onclick={() => select(t)}
          onkeydown={onTabKey}
          >{label}{#if t === 'backup' && app.exportDue}<span class="due" title="Sicherung empfohlen"
              ><span class="sr">(Sicherung empfohlen)</span></span
            >{/if}</button
        >
      {/each}
    </div>
    <div class="tabpanel" id="profPanel" role="tabpanel" aria-labelledby={'profTab-' + tab} tabindex="-1">
      {#if tab === 'overview'}
        <ProfileOverview a={analysis} goto={(t) => select(t, true)} />
      {:else if tab === 'keys'}
        {#if fingers}
          <h3 class="deep-h first">
            Tastenkarte{#if fingers.n < 3000}{' '}<span class="note">· vorläufig ({fingers.n} Anschläge)</span>{/if}
          </h3>
          <KeyMap a={fingers} />
          <p class="small keymap-legend">Je dunkler die Taste, desto häufiger vertippst du dich dort.</p>
        {/if}
        <Insights a={analysis} showTip={false} />
        {#if fingers}
          <div class="cols deep">
            <FingerStats a={fingers} />
            <ErrorKinds sessions={app.sessions} />
          </div>
        {/if}
        {#if app.sessions.length}<RhythmStats sessions={app.sessions} />{/if}
      {:else if tab === 'history'}
        <TrendStats sessions={app.sessions} />
        <h3 class="deep-h">Letzte Abschnitte</h3>
        {#if last.length}
          <table id="profHist">
            <thead>
              <tr><th>Datum</th><th>Text</th><th>WPM</th><th>Genauigkeit</th><th>Gleichm.</th></tr>
            </thead>
            <tbody>
              {#each last as s (s.id)}
                <tr>
                  <td>{new Date(s.date).toLocaleDateString('de-AT')}</td>
                  <td>{s.bookTitle} · {s.section + 1}</td>
                  <td>{round1(s.stats.wpm)}</td>
                  <td>{String(round1(s.stats.accuracy * 100)).replace('.', ',')} %</td>
                  <td>{s.stats.consistency === null ? '–' : Math.round(s.stats.consistency) + ' %'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <p class="empty">Noch keine Abschnitte abgeschlossen.</p>
        {/if}
      {:else}
        <p class="small first" id="profStore">
          {app.db
            ? 'Profil, Verlauf und Bücher liegen nur in diesem Browser. Wenn Browserdaten gelöscht werden, sind sie weg – sichere sie deshalb ab und zu als Datei.'
            : 'Dieser Browser erlaubt keine dauerhafte Speicherung: Nach dem Schließen ist alles weg. Sichere deine Daten als Datei.'}{since >
          0
            ? ` Seit der letzten Sicherung: ${since} ${plural(since)}.`
            : ''}
        </p>
        <label class="check"
          ><input type="checkbox" id="profWithBooks" bind:checked={withBooks} /> Bücher in die Sicherung aufnehmen</label
        >
        <div class="backup-actions">
          <button class="primary" id="profExport" onclick={exportNow}>Sichern (JSON) …</button>
          <button id="profImport" onclick={() => fileInput.click()}>Sicherung laden …</button>
        </div>
        <div class={msgErr ? 'msg err' : 'msg'} id="profMsg" role="status">{msg}</div>
        <h3 class="deep-h">Neu beginnen</h3>
        <p class="small">
          Löscht Profil und Verlauf in diesem Browser. Deine Bücher bleiben erhalten. Sichere vorher, wenn du die Daten
          behalten willst.
        </p>
        <button class="danger" id="profReset" onclick={reset}>Profil und Verlauf löschen …</button>
      {/if}
    </div>
    <input type="file" id="profFile" accept=".json,application/json" hidden bind:this={fileInput} onchange={onFile} />
    <div class="actions">
      <button id="profClose" onclick={() => (app.profOpen = false)}>Schließen</button>
    </div>
  </div>
</Modal>
