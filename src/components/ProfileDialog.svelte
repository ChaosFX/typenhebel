<script lang="ts">
  import { analyze } from '../core';
  import { app, storageWarning } from '../app/state.svelte';
  import { clearHistory, importJson, isQuotaError } from '../data/db';
  import { ImportError } from '../data/records';
  import { round1 } from '../ui/format';
  import Insights from './Insights.svelte';
  import Modal from './Modal.svelte';

  let fileInput: HTMLInputElement;
  let withBooks = $state(true);
  let msg = $state('');
  let msgErr = $state(false);

  // Nur berechnen, solange der Dialog offen ist
  const analysis = $derived(app.profOpen ? analyze(app.profile) : null);
  const last = $derived(app.sessions.slice(-10).reverse());
  const since = $derived(app.sessions.length - app.exportedAtSessions);
  const plural = (n: number): string => (n === 1 ? 'Abschnitt' : 'Abschnitte');

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
  initialFocus={() => {
    msg = '';
    return null;
  }}
  onclosed={() => app.focusInput()}
>
  <div class="in">
    <h2>Dein Profil</h2>
    <div id="profBody">
      <p class="small">
        {`${app.profile.sessions} ${plural(app.profile.sessions)} · ${app.profile.n} Anschläge ausgewertet.`}
      </p>
      <Insights a={analysis} />
      <h3 style="margin-top:1.4rem">Letzte Abschnitte</h3>
      {#if last.length}
        <table>
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
    </div>
    <h3 style="margin-top: 1.4rem">Sichern</h3>
    <p class="small" id="profStore">
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
    <div class={msgErr ? 'msg err' : 'msg'} id="profMsg" role="status">{msg}</div>
    <input type="file" id="profFile" accept=".json,application/json" hidden bind:this={fileInput} onchange={onFile} />
    <div class="actions">
      <button id="profReset" onclick={reset}>Daten löschen</button>
      <button id="profImport" onclick={() => fileInput.click()}>Importieren …</button>
      <button id="profExport" onclick={exportNow}>Exportieren (JSON)</button>
      <button class="primary" id="profClose" onclick={() => (app.profOpen = false)}>Schließen</button>
    </div>
  </div>
</Modal>
