<script lang="ts">
  // Einstellungs-Panel unter der Werkzeugleiste (Phase 4): nicht modal, schließt mit Esc, Klick daneben oder dem Knopf.
  import { app, TEXT_SCALE, type Settings } from '../app/state.svelte';

  let { anchor }: { anchor: HTMLElement | undefined } = $props();
  let dlg: HTMLDialogElement;

  type Choice<K extends keyof Settings> = [value: Settings[K], label: string][];
  const THEMES: Choice<'theme'> = [
    ['light', 'Hell'],
    ['sepia', 'Sepia'],
    ['dark', 'Dunkel'],
  ];
  const SIZES: Choice<'textSize'> = [
    ['small', 'klein'],
    ['normal', 'normal'],
    ['large', 'groß'],
    ['xlarge', 'sehr groß'],
  ];
  const CARETS: Choice<'caret'> = [
    ['bar', 'Strich'],
    ['underline', 'Unterstrich'],
  ];
  const KEYBOARDS: Choice<'keyboard'> = [
    ['training', 'nur im Training'],
    ['always', 'immer'],
    ['off', 'aus'],
  ];
  const groups = [
    { key: 'theme', legend: 'Farbe', choices: THEMES },
    { key: 'textSize', legend: 'Textgröße', choices: SIZES },
    { key: 'caret', legend: 'Cursor', choices: CARETS },
    { key: 'keyboard', legend: 'Tastatur', choices: KEYBOARDS },
  ] as const;

  function set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    app.settings[key] = value;
    app.saveSettings();
  }

  $effect(() => {
    if (app.setOpen && !dlg.open) {
      dlg.show();
      // Die Sitzung ist pausiert (Fokus weg vom Eingabefeld), der Text bleibt aber sichtbar,
      // damit Farbe und Textgröße gleich zu sehen sind.
      app.masked = false;
      dlg.querySelector<HTMLElement>('input:checked, input')?.focus();
    } else if (!app.setOpen && dlg.open) dlg.close();
  });

  function close(): void {
    app.setOpen = false;
  }

  // Klick außerhalb (nicht auf den Knopf, der selbst umschaltet) schließt das Panel
  function onPointerDown(e: PointerEvent): void {
    if (!app.setOpen) return;
    const t = e.target as Node;
    if (dlg.contains(t) || anchor?.contains(t)) return;
    close();
  }

  // Lautstärke hörbar machen, sobald der Regler losgelassen wird
  const preview = (): void => app.snd.play('key');
</script>

<svelte:document onpointerdown={onPointerDown} />

<dialog
  bind:this={dlg}
  class="settings"
  id="setDlg"
  aria-label="Einstellungen"
  onkeydown={(e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }}
  onclose={() => {
    app.setOpen = false;
    app.focusInput();
  }}
>
  <div class="set-row">
    <span class="set-label">Ton</span>
    <div class="set-sound">
      <label class="switch"
        ><input
          type="checkbox"
          id="setSound"
          aria-label="Ton"
          checked={app.settings.sound}
          onchange={(e) => set('sound', e.currentTarget.checked)}
        />
        <span>{app.settings.sound ? 'an' : 'aus'}</span></label
      >
      <label class="volume"
        ><span class="sr">Lautstärke</span>
        <input
          type="range"
          id="setVolume"
          min="0"
          max="100"
          step="5"
          disabled={!app.settings.sound}
          value={app.settings.volume}
          aria-valuetext="{app.settings.volume} %"
          oninput={(e) => set('volume', Number(e.currentTarget.value))}
          onchange={preview}
        /></label
      >
    </div>
  </div>
  {#each groups as g (g.key)}
    <fieldset class="set-row" id={'set-' + g.key}>
      <legend class="set-label">{g.legend}</legend>
      <div class="seg">
        {#each g.choices as [value, label] (value)}
          <label
            ><input
              type="radio"
              name={'set-' + g.key}
              {value}
              checked={app.settings[g.key] === value}
              onchange={() => set(g.key, value as never)}
            /><span
              style:font-size={g.key === 'textSize'
                ? `${0.78 * TEXT_SCALE[value as keyof typeof TEXT_SCALE]}rem`
                : null}>{label}</span
            ></label
          >
        {/each}
      </div>
    </fieldset>
  {/each}
</dialog>
