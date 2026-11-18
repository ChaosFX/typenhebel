# Typenhebel – Spezifikation

Deutschsprachiger Tipptrainer: Man tippt gemeinfreie Literatur ab, die Seite analysiert das Tippverhalten und zeigt Verbesserungsmöglichkeiten. Statische Web-App, gehostet auf GitHub Pages, keine Server, keine Accounts.

Dieses Dokument ist die Arbeitsgrundlage für Claude Code. Der funktionierende Prototyp liegt als `prototype/index.html` bei und ist die **Referenz für Verhalten und Optik**.

---

## 1. Ziele und Nicht-Ziele

**Ziele**
1. Genauigkeit und Tempo trainieren, mit Fokus auf Genauigkeit.
2. Abtippen deutscher Literatur (Start: Stefan Zweig, *Die Welt von Gestern*).
3. Optik und Haptik so gut, dass schon das Tippen Freude macht (Typografie, Cursor, Sound, ruhige Animationen).
4. Aus Tastendaten verwertbare Erkenntnisse und gezielte Übungen ableiten.
5. Alles läuft lokal im Browser. Es werden keine Daten übertragen.

**Nicht-Ziele (vorerst)**
- Kein Backend, keine Accounts, kein Sync zwischen Geräten (nur Export/Import).
- Keine Mobil-/Touch-Optimierung (Hinweis „bitte mit Hardware-Tastatur“ genügt).
- Kein Multiplayer, keine Ranglisten.
- Kein Machine Learning. Robuste Statistik genügt.

---

## 2. Ausgangslage: der Prototyp

`prototype/index.html` (eine Datei, ca. 40 KB, Vanilla JS) enthält bereits:

- **Kernlogik** zwischen den Markern `// <core>` und `// </core>`: `matches`, `prepare`, `segment`, `Session`, `series`, `mergeProfile`, `analyze`, `hint`. Sie ist DOM-frei und von 13 Node-Tests abgedeckt (`prototype/tests/core.test.mjs`).
- **UI**: Papier-Design hell/dunkel, gleitender Cursor, Fehlerfeedback, Fortschrittsbalken, Live-Statistik, Ergebnisansicht mit Tempoverlauf und Auffälligkeiten, Profil-Dialog, Text-Import per Einfügen/.txt, Web-Audio-Klicks.
- **Persistenz**: localStorage (Bücher, Sessions, Profil, Fortschritt).

**Phase 0 ist die Migration dieses Verhaltens in ein sauberes Projekt, ohne Funktionsänderung.**

### Bewusst getroffene Entscheidungen, nicht ohne Rücksprache ändern
- **Metriken** (siehe Abschnitt 5): WPM = 5 Zeichen, Leerlauf-Kappung 3 s, Gleichmäßigkeit nach Kogasa-Formel.
- **Typografie-Äquivalenz**: Angezeigt wird das Original (`„ “ » « ‚ ‘ ’ – —`), akzeptiert werden zusätzlich `"`, `'` und `-`. `…` wird zu `...` normalisiert, `ſ` zu `s`.
- **Zwei Modi**: *Strikt* (Cursor wartet, Rücktaste deaktiviert) und *Frei* (Fehler bleiben stehen, Korrektur per Rücktaste, Abschluss nur fehlerfrei).
- **Texte werden als NFC normalisiert**, damit `ä` immer ein Zeichen ist.

---

## 3. Stack und Struktur

- **Vite + TypeScript** (strict), **Vitest** für Logik, **Playwright** für E2E.
- UI-Framework: **Svelte 5** (entschieden 2026-11-15, vor Phase 3; vorher Vanilla TS). Begründung: Phase 3 bringt viele neue Auswertungsansichten, und `main.ts` war mit globalem Zustand und HTML-Strings an seine Grenze gekommen. Svelte wird beim Bauen übersetzt, keine externen Requests. Der Tipp-Hotpath (Zeichen färben, Cursor, Eingabe) bleibt bewusst imperativ (`src/app/typing.svelte.ts`).
- **Dexie** für IndexedDB. **JSZip** (oder `fflate`) für EPUB.
- Deployment: GitHub Actions → GitHub Pages. `base` in `vite.config.ts` auf den Repo-Namen setzen.
- Keine Laufzeit-Abhängigkeit von CDNs, keine externen Requests.

```
/
├─ prototype/                 # Referenz, nicht anfassen
│  ├─ index.html
│  └─ tests/core.test.mjs
├─ src/
│  ├─ core/                   # reine Logik, keine DOM-Zugriffe
│  │  ├─ text.ts              # prepare, segment, Normalisierung
│  │  ├─ match.ts             # matches() + Äquivalenzklassen
│  │  ├─ session.ts           # Session, Stats
│  │  ├─ analysis.ts          # Profil, Analyse, Drills
│  │  └─ keyboard.ts          # QWERTZ-Layout: Finger/Hand/Nachbartasten
│  ├─ input/engine.ts         # Textarea, beforeinput, Komposition, Backspace
│  ├─ app/state.svelte.ts     # App-Zustand (Runes) und Abläufe: Buch öffnen, Abschnitt, Abschluss, Sichern
│  ├─ app/typing.svelte.ts    # Tippfläche: Zeichen, Cursor, Live-Werte (imperativ, pro Anschlag)
│  ├─ components/             # Svelte: Ergebnis, Dialoge (Bibliothek, Cover, Text laden, Profil), Auswertungen
│  ├─ ui/                     # Demotext, Formatierung
│  ├─ App.svelte              # Hauptansicht
│  ├─ audio/sound.ts
│  ├─ data/db.ts              # Dexie-Schema, Migrationen, Export/Import
│  ├─ data/records.ts         # Datensätze, Exportformat, Zusammenführen (ohne IndexedDB, getestet)
│  ├─ epub/import.ts
│  └─ main.ts
├─ public/fonts/              # selbst gehostet (WOFF2)
├─ scripts/                   # Korpus-Build (Node)
├─ tests/ (unit) und e2e/
└─ .github/workflows/deploy.yml
```

---

## 4. Datenmodell (TypeScript)

```ts
interface Book {
  id: string;
  title: string;
  author: string;
  source?: { name: string; url?: string; edition?: string; license?: string };
  chapters: { title: string; sectionStart: number }[];
  sections: Section[];            // in IndexedDB getrennt speichern, wenn groß
}
interface Section { text: string; breaks: number[] }   // breaks = Index des Leerzeichens nach Absatzende

interface KeyEvent {              // pro Tastendruck, kompakt speicherbar
  kind: 'k' | 'b';                // Zeichen oder Rücktaste
  i: number;                      // Position im Abschnitt
  exp?: string; got?: string; ok?: boolean;
  t: number;                      // ms seit Start ohne Pausen
  at: number;                     // kumulierte aktive Zeit (Leerlauf gekappt)
  dt: number | null;              // ms seit letztem Ereignis, null nach Pause/Start
}
interface SessionRecord {
  id: string; date: number; bookId: string; section: number;
  strict: boolean; stats: SessionStats;
  events?: KeyEvent[];            // Rohdaten nur für die letzten N Sessions behalten
  digest?: Digest;                // Kurzfassung der Rohdaten, bleibt dauerhaft (Phase 6)
}
interface Profile {               // laufend aggregiert
  version: 1; sessions: number; keystrokes: number;
  chars: Record<string,[n:number,err:number]>;
  bigrams: Record<string,[n:number,sumMs:number]>;
  confusions: Record<string,number>;
  classes: Record<string,[n:number,err:number]>;
  // ab Phase 3 zusätzlich: Finger, Trigramme, Fehlerarten, Ermüdung
}
```

Alle gespeicherten Strukturen tragen eine **Schema-Version**. Migrationen sind Pflicht, wenn sich das Modell ändert.

---

## 5. Metrikdefinitionen (verbindlich)

| Größe | Definition |
|---|---|
| WPM netto | (korrekt getippte Zeichen / 5) / aktive Minuten |
| WPM brutto | (alle Anschläge / 5) / aktive Minuten |
| Aktive Zeit | Summe der Intervalle zwischen Ereignissen, jedes auf max. 3000 ms gekappt; Zeit vor dem ersten Anschlag zählt nicht; Fokusverlust pausiert |
| Genauigkeit | richtige Anschläge / alle Anschläge (Zeichen-Anschläge, ohne Rücktaste) |
| Gleichmäßigkeit | `100·(1 − tanh(cv + cv³/3 + cv⁵/5))`, cv = Variationskoeffizient der Intervalle < 3 s; erst ab > 5 Intervallen |
| Bigramm-Intervall | nur wenn beide Anschläge richtig, direkt aufeinanderfolgende Positionen, Intervall < 3 s, kein Pausen-/Rücktasten-Übergang; für Aggregation auf 1500 ms gekappt |

---

## 6. Eingabe-Engine: Anforderungen und bekannte Fallstricke

- Verstecktes `<textarea>` hält den Fokus; Klick irgendwo auf die Seite fokussiert es.
- **Zeichen** kommen über `beforeinput` (`insertText`), dort `preventDefault()`. Zeitstempel `event.timeStamp`.
- **Tottasten/Komposition** (`^`, `´`, `` ` `` + Buchstabe): bei `compositionstart` nichts verarbeiten, bei `compositionend` die Zeichen aus `e.data` einspeisen, danach Feld leeren.
- **Rücktaste über `keydown`** behandeln, nicht über `beforeinput`: Bei leerem Feld feuert `beforeinput` für Rücktaste in Chrome nicht. Dabei `isComposing` beachten.
- Einfügen, Drop, Wortlöschen (Strg+Rücktaste) und Zeilenumbruch blockieren.
- **Blur = Pause**, Fokus = Fortsetzen; das erste Intervall nach Pause ist `null`.
- Tippen über das Textende hinaus ignorieren; im freien Modus Hinweis anzeigen, wenn noch Fehler vorhanden sind.
- **Testmatrix**: Firefox unter Linux (Fedora, Hauptplattform) und Edge unter Windows (beruflich), jeweils deutsches Layout auf Standard-ISO-Tastatur (großes Enter, `<>|` rechts neben der linken Umschalttaste); dazu Chrome/Edge und Safari (macOS). Automatisiert laufen die E2E-Tests in Chromium und Firefox. Geprüft wird jeweils mit deutscher Tastatur inkl. Tottasten, `ß`, `ä ö ü`, `Shift`-Zeichen, `AltGr`-Zeichen (`@ € { }`). Diese Prüfung kann Claude Code nicht vollständig automatisieren. Dominik testet manuell, Claude Code liefert dafür eine kurze Checkliste.

---

## 7. Phasen mit Akzeptanzkriterien

### Phase 0: Migration (Pflicht zuerst)
- Projekt aufsetzen, Kernlogik nach TypeScript portieren, **alle 13 Tests nach Vitest übernehmen und grün**.
- UI funktional und optisch deckungsgleich mit dem Prototyp (Screenshot-Vergleich in Playwright, hell und dunkel).
- E2E: Abschnitt komplett tippen → Ergebnis; Fehler im Strikt-Modus blockiert; Freier Modus mit Rücktaste; Paste wirkungslos; Neuladen behält Fortschritt.
- Deploy auf GitHub Pages funktioniert.

### Phase 1: Text-Pipeline (EPUB-Import)
- Import einer `.epub`-Datei im Browser: `container.xml` → OPF → Spine → XHTML-Kapitel in Lesereihenfolge.
- Aus XHTML sauberen Fließtext gewinnen: Überschriften als Kapiteltitel übernehmen (nicht tippen), Absätze erhalten, Fußnoten, Seitenzahlen, Navigation und Metadaten entfernen. Kursiv und Fett werden verworfen.
- Dann dieselbe Normalisierung und Segmentierung wie im Prototyp.
- Kapitelauswahl in der UI, Fortschritt je Buch und Kapitel.
- **Claude Code muss echte EPUB-Beispiele prüfen**: Dominik legt die Gutenberg-EPUB von *Die Welt von Gestern* unter `samples/` ab (liegt dort bereits, per `.gitignore` nicht im Repo). Parser nicht „blind“ schreiben.
- Warnung bei seltenen Zeichen, die auf der deutschen Tastatur schwer erreichbar sind; Option, diese zu ersetzen.
- Akzeptanz: Zweig-EPUB lädt vollständig, 18 Kapitel erkannt, keine Fußnotenreste, Stichprobe von 5 Abschnitten ohne Textfehler.
- Entschieden (Dominik, 2026-11-14): **Mottos/Epigraphe werden mitgetippt**, auch das Motto der Titelseite. Übrige Titelei (Titel, Verlag, Ausgabe) entfällt.

### Phase 2: Persistenz
- Migration von localStorage nach IndexedDB (Dexie), Bücher/Abschnitte getrennt von Sessions und Profil.
- Rohdaten (`events`) nur für die letzten 30 Sessions, ältere werden zu Aggregaten verdichtet.
- Export/Import als JSON (Profil, Sessions, optional Bücher), Import mit Versionsprüfung und Zusammenführen statt Überschreiben.
- Hinweis in der UI, dass Browserdaten gelöscht werden können; Erinnerung zum Export alle ~30 Sessions.
- Umgesetzt (2026-11-14): Dexie-Datenbank `typenhebel` mit Tabellen `books` (Metadaten), `texts` (Abschnitte je Buch), `sessions`, `progress`, `kv` (Profil, aktuelles Buch, Stand der letzten Sicherung). Nur die Einstellungen bleiben in localStorage (synchron beim Start nötig, gegen Farbflackern). „Verdichten“ heißt: Ältere Sessions behalten ihre Kennzahlen, nur die Tastenereignisse entfallen; das Profil aggregiert ohnehin alle Sessions. Auswertungen, die Rohdaten brauchen (Phase 3: Ermüdung, Post-Error-Slowing), stützen sich deshalb auf die letzten 30 Sessions.
- Zusammenführen beim Import: Sessions und Bücher nach ID entdoppeln. Profil: Enthält der Import alle lokalen Sessions, gilt sein Profil; ist er vollständig lokal vorhanden, ändert sich nichts; sind beide disjunkt, werden die Profile addiert; bei teilweiser Überschneidung zählen nur neue Sessions mit Rohdaten. Fortschritt: erledigte Abschnitte vereinigen, lokale Leseposition hat Vorrang. Der Export aus Phase 0/1 (`version: 1`) wird weiter angenommen.
- Ergänzt (Dominik, 2026-11-14): **Bibliothek** statt Buchmenü – Seite mit Cover-Raster, Fortschritt je Buch, „Text laden“ und Löschen; jedes Buch merkt sich seine Stelle. Erreichbar über „Bibliothek“ und den Buchtitel.
- **Cover** werden erzeugt (`src/core/cover.ts`, SVG), nicht aus dem Netz geholt: Coverbilder sind fast immer geschützt. Vier Layouts (Rahmen, Tasten, Initial, Typoskript), neun Farben; automatisch nur Rahmen und Tasten (Dominik), jedes Cover lässt sich in der Bibliothek frei wechseln. Die Wahl liegt in `kv.covers` und wandert mit dem Export.

### Phase 3: Analyse v2 und adaptives Training
- `keyboard.ts`: QWERTZ-Zuordnung Zeichen → Finger/Hand/Reihe, Nachbartasten, Shift-Seite.
  - Umgesetzt (2026-11-15): deutsche ISO-Tastatur (T1), Fingerzuordnung nach Zehnfingersystem; `6` gehört zum linken Zeigefinger, die Umschalttaste drückt immer die andere Hand, AltGr-Zeichen und Tottasten (`^ ´ \``, Akzentbuchstaben als Tottaste + Buchstabe) sind abgebildet, typografische Zeichen laufen über ihre Tastatur-Entsprechung (`„` → `"`). Nicht direkt tippbare Zeichen (z. B. `ç`, `ñ`) liefern `null`.
- **Fehlerarten** klassifizieren: Nachbartaste getroffen, Vertauschung zweier Zeichen, Auslassung, Doppelanschlag, Groß-/Kleinschreibung (Shift), Umlaut-Fehler.
  - Umgesetzt (2026-11-15): `core/errors.ts` ordnet jeden falschen Anschlag aus dem Protokoll ein; den Text liest es aus den Soll-Zeichen der Ereignisse, braucht also nur die Rohdaten. Zusätzlich gibt es „Folgefehler“ (Fehler direkt nach einem Fehler, z. B. verschobener Rest nach einer Auslassung) und „Sonstige“. „Umschalttaste“ umfasst auch Zeichen derselben Taste (`ß`/`?`, `.`/`:`). Grenze: Im strikten Modus ist eine sofort korrigierte Auslassung nicht von einer Vertauschung zu unterscheiden; sie zählt als Vertauschung.
- Auswertungen: Tempo und Fehler **pro Finger/Hand**, langsame **Trigramme** und **Wortanfänge/-enden**, **Post-Error-Slowing** (Verlangsamung nach Fehlern), **Ermüdung** (Verlauf innerhalb der Session), Trend über Tage.
- Statistik robust halten: Median statt Mittel wo möglich, **Glättung der Fehlerraten** (z. B. Wilson-Intervall oder Beta-Prior), Mindeststichproben, Hinweise „vorläufig“ bei geringer Datenlage. Keine Aussage ohne Datenbasis.
  - Umgesetzt (2026-11-15): `core/stats.ts` (Median, Wilson-Intervall, Glättung mit Beta-Prior) und `core/fingers.ts`. Finger, Hände, Reihen und Tasten kommen aus dem Profil über **alle** Abschnitte: Fehler aus den Zeichen, Tempo aus den Zeichenpaaren (die Zeit zählt für den Finger des zweiten Zeichens); dafür war keine Schemaänderung nötig. „Langsam“ heißt mindestens 15 % über dem Durchschnitt bei mindestens 40 Messungen, „fehleranfällig“ heißt, dass die untere Wilson-Grenze über der Durchschnittsquote liegt, bei mindestens 150 Anschlägen und 3 Fehlern. Fehlerarten kommen aus den Rohdaten der letzten 30 Abschnitte. Anzeige im Profil: Tasten-Wärmebild, Tabelle je Finger/Hand, Fehlerarten, Empfehlungen mit „n = …“.
  - Umgesetzt (2026-11-15): `core/rhythm.ts` aus den Rohdaten der letzten 30 Abschnitte. Dreiergruppen: drei richtige Anschläge an aufeinanderfolgenden Stellen, Zeit = 2. + 3. Intervall (je auf 1500 ms gekappt), Median, langsam ab ×1,25 gegenüber dem Median aller Gruppen und n ≥ 4; Wortanfänge/-enden sind Gruppen am Anfang bzw. Ende eines Worts. Verlangsamung nach Fehlern: Median der 3 richtigen Anschläge nach einem Fehler gegen Anschläge mit mehr als 5 Abstand zum letzten Fehler (ab 10 Fehlern). Ermüdung: erstes gegen letztes Drittel jedes Abschnitts (ab 5 Abschnitten mit mindestens 60 Anschlägen). Trend: Median-WPM je Übungstag über alle Abschnitte (letzte 14 Übungstage).
- **Adaptive Übungen**: Aus dem Korpus Abschnitte/Sätze wählen, die die Schwach-Bigramme und -Zeichen des Profils enthalten (Scoring und Ranking). Zusätzlich „Wort-Drills“ als kurze Übungsmodi. Optional „Trainingsplan des Tages“.
  - Umgesetzt (2026-11-15): `core/training.ts`. Ziele (höchstens 6) kommen aus langsamen Dreiergruppen, Wortanfängen/-enden, langsamen Bigrammen, fehleranfälligen Zeichen und den Buchstaben schwacher Finger, gewichtet nach Abweichung und √n; ohne eigene Daten gelten typische Hürden (sch, ung, ä, ö, ü, ß, ck). Daraus entsteht ein Training mit bis zu drei Abschnitten: Wort-Drill zum stärksten Ziel, Sätze aus den eigenen Texten mit möglichst vielen Zielen, Wort-Drill zum nächsten Ziel. Jeder Abschnitt zeigt in der Kopfzeile, was geübt wird und warum. Das Training ist ein erzeugtes Buch („Training“ im Hauptmenü, Dominik 2026-11-15): nicht gespeichert, ohne Fortschritt, nach dem letzten Abschnitt neu gebaut; die Abschnitte zählen normal im Profil. „Text laden“ ist aus dem Hauptmenü entfernt (bleibt als Kachel in der Bibliothek). Ein „Trainingsplan des Tages“ folgt erst nach Erprobung im Alltag.
- Jede Empfehlung zeigt ihre Begründung („weil …, n = …“).
- Akzeptanz: Mit synthetisch erzeugten Events (Unit-Tests) liefert die Analyse reproduzierbar die eingebauten Schwächen (z. B. künstlich langsamer Ringfinger).

### Phase 4: Gestaltung und Barrierefreiheit
- **Schrift selbst hosten** (z. B. Literata, OFL-Lizenz, WOFF2 mit Subset für Latein + deutsche Zeichen). Keine Google-Fonts-Einbindung (DSGVO-Abmahnrisiko).
  - Umgesetzt (2026-11-16): Literata als Variable Font (Gewicht + optische Größe) aus Fontsource 5.3.0, Teilmengen Latin und Latin Extended (letztere lädt nur bei Bedarf), in `src/fonts/` mit `OFL.txt`. Nach dem Laden der Schrift wird der Cursor neu gesetzt. Der Screenshot-Vergleich gibt dem Prototyp dieselbe Schrift und prüft den Cursor getrennt.
- Cursorform umschaltbar (Dominik, 2026-11-16, zum Ausprobieren): Strich (Standard) oder Unterstrich unter dem nächsten Zeichen, Knopf „Cursor“ in der Werkzeugleiste.
- Sound: bessere, leise Klang-Samples oder weiterhin synthetisch; Lautstärkeregler; Sound standardmäßig an, aber dezent.
  - Umgesetzt (2026-11-15, vorgezogen): **Aufnahmen einer echten Schreibmaschine** (Dominik: Synthese klang zu künstlich bzw. „wie Smartphone-Tastaturen“; Hörvergleich, Wahl: Hermes Precisa 305). Quelle BigSoundBank (CC0), dazu Erika 5 von Wikimedia Commons (CC BY 4.0) bereitgelegt, aber noch nicht verwendet. `npm run sounds` schneidet aus den Originalen je Maschine eine FLAC-Datei mit allen Klängen plus Beschreibung (`public/sounds/<id>.json`: Abschnitte, Lautstärkeausgleich, Quelle, Lizenz); Quellen in `public/sounds/QUELLEN.md`. Geladen wird erst, wenn der Ton gebraucht wird (gleiche Herkunft); bis dahin und bei Fehlern synthetischer Klang (`audio/synth.ts`). Vertipper: gedämpfter, tieferer Anschlag. Lautstärkeregler seit 2026-11-18 im Einstellungs-Panel.
  - Später (Dominik, 2026-11-15): verschiedene Schreibmaschinen zur Auswahl, passend dazu Themen (Klang und Optik). Die Struktur je Maschine ist dafür angelegt; bei der Erika muss die Namensnennung dann in der App erscheinen.
- **Schreibmaschinen-Tastatur** unter dem Text (Dominik, 2026-11-17), damit der Blick beim Üben auf dem Bildschirm bleibt.
  - Umgesetzt (2026-11-17): `components/Typewriter.svelte`, deutsche ISO-Belegung aus `core/keyboard.ts` als runde Tastenkappen mit Chromring, Leertaste als Chromleiste, leicht geneigt. Die nächste Taste leuchtet, mit der Umschalttaste der anderen Hand bzw. AltGr; bei Tottasten leuchtet der zweite Anschlag schwächer. Darunter steht Zeichen und Finger („L · rechter Ringfinger + Umschalttaste links“). Jeder Anschlag lässt die getroffene Taste kurz einsinken, ein Fehler färbt sie rot (bei `prefers-reduced-motion` nur die Farbe). Hervorheben und Anschlagen laufen imperativ im Tipp-Hotpath (Web Animations, kein Reflow). Knopf „Tastatur“: nur im Training (Standard), immer oder aus. Die Tastatur bleibt beim Scrollen am unteren Rand sichtbar. Rein visuell (`aria-hidden`).
- Fokus-Modus (alles außer Text ausblenden), Textgröße einstellbar, zusätzlicher Farbmodus (Sepia).
  - Umgesetzt (2026-11-18, Dominik: Panel statt voller Werkzeugleiste): Knopf **„Einstellungen“** öffnet unter der Werkzeugleiste ein nicht modales Panel (`components/SettingsPanel.svelte`; schließt mit Esc, Klick daneben oder dem Knopf, danach geht das Tippen weiter). Darin: Ton an/aus mit **Lautstärkeregler** (0–100, Standard 70 ≈ bisherige Lautstärke, quadratische Kurve, höchstens doppelt so laut; Vorhören beim Loslassen), **Farbe Hell/Sepia/Dunkel** (Sepia: gelblicheres Papier, Text ≥ 4,5 : 1, noch nicht getippter Text 3,5 : 1), **Textgröße** klein/normal/groß/sehr groß (Faktor 0,88/1/1,15/1,32 auf `--fs`; der Cursor folgt per ResizeObserver), Cursor und Tastatur. In der Leiste bleiben „Modus“ und „Einstellungen“. Solange das Panel offen ist, ist die Sitzung pausiert, der Text bleibt aber sichtbar. 
  - Fokus-Modus umgesetzt (2026-11-18): Knopf **„Fokus“** in der Werkzeugleiste blendet Logo-Zeile, Kopfzeile, Fortschrittsbalken, Live-Werte und Tastenhinweise aus; es bleiben der Text, Hinweise im Text (z. B. Fehler im Modus „Frei“), die Ergebniskarte und die Schreibmaschinen-Tastatur, sofern eingeschaltet. Oben rechts steht dezent „Fokus beenden“ (bei Hover/Fokus voll sichtbar). Der Zustand wird gespeichert (`settings.focus`) und gilt nach dem Neuladen weiter. Im Training ist damit auch die Zeile „was geübt wird“ ausgeblendet.
- `prefers-reduced-motion`, ausreichend Kontrast (WCAG AA für Text), sichtbare Fokusrahmen, sinnvolle ARIA-Rollen für Dialoge.
- Die Optik darf besser werden, aber Charakter beibehalten: ruhig, warm, buchartig.

### Phase 5: PWA und Rechtliches
- Service Worker, installierbar, offline lauffähig.
- Seite „Datenschutz“: keine Datenübertragung, keine Cookies, nur lokale Speicherung. Prüfen, ob für die öffentliche Seite ein Impressum nötig ist (Dominik klärt das selbst).
- Lizenz für den Code (Vorschlag: MIT), Lizenzübersicht für Schriften und Texte.
- Content-Security-Policy per `<meta>`, die externe Requests verbietet.

### Phase 6: Fortschritt und Motivation
Angeregt von Dominik (2026-11-17): Training optimieren, Fortschritt zeigen, sichtbar machen, welche Bereiche besser geworden sind. Kann vor Phase 4/5 laufen. Grundton wie überall: ruhig, warm, buchartig, also **keine** Punkte, Level oder lauten Effekte, sondern Tagebuch, Meilensteine und belegter Fortschritt.
- **Kurzfassung je Abschnitt** (Voraussetzung für alles Weitere, zuerst umsetzen): Die Rohdaten entfallen nach 30 Abschnitten, das Profil zählt alles zusammen. Ohne eigene Aufzeichnung lässt sich später nicht sagen, wie eine Taste vor drei Wochen war, und rückwirkend lässt sich das nicht herstellen.
  - Umgesetzt (2026-11-17): `core/digest.ts`. Jede Session bekommt beim Speichern eine **additive** Kurzfassung (`digest`): Profil nur dieses Abschnitts (Zeichen, Bigramme, Verwechslungen, Zeichenklassen), Dreiergruppen sowie Wortanfänge/-enden als [n, Summe ms], Fehler je Art, Verlangsamung nach Fehlern und Ermüdung als Zähler und Summen. Definitionen wie in Phase 3 (dieselbe Schleife `scanLog` in `core/rhythm.ts`), Zeiten je Intervall auf 1500 ms gekappt und auf ganze ms gerundet. Weil Mediane sich nicht addieren lassen, vergleichen Zeitraum-Auswertungen **Mittelwerte** der gekappten Zeiten. Jeder Zeitraum (Tag, Woche, „vor dem Training“) ergibt sich mit `sumDigests`. Statt einer eigenen Tagestabelle hängt die Kurzfassung an der Session: Export, Import und Entdoppeln laufen damit über die Session-ID wie bisher. Datenbank-Schema 2 ergänzt sie für Sessions, die noch Rohdaten haben; Importe ohne Kurzfassung bekommen sie aus den Rohdaten, ungültige werden neu berechnet oder verworfen. Größe etwa 15 KB je Abschnitt (Rohdaten etwa 100 KB). Die App hält die Kurzfassungen nicht im Speicher, sie liegen nur in IndexedDB. Sessions, deren Rohdaten vorher schon verdichtet waren, haben keine.
- **Verbesserungen zeigen**: „Seit letzter Woche: ä 18 % schneller, ‚ung‘ von langsam auf normal, linker Ringfinger 40 % weniger Fehler“, je Taste, Finger, Dreiergruppe und Fehlerart, immer mit „n = …“ und nur bei ausreichender Datenbasis in beiden Zeiträumen (Mindeststichproben wie in Phase 3).
  - Umgesetzt (2026-11-18): `core/progress.ts`, Abschnitt „Seit letzter Woche“ im Profil. Verglichen werden die Kurzfassungen der letzten 7 Tage (inkl. heute) mit den 7 Tagen davor, je Zeichen (Tempo: Intervalle der Paare, die auf das Zeichen enden, wie bei den Fingern; Fehlerquote), Finger (Tempo, Fehler), Dreiergruppe (Tempo, dazu „von langsam auf normal“ mit der Schwelle ×1,25 aus Phase 3, jeweils gegen das Mittel des eigenen Zeitraums) und Fehlerart (je Anschlag). Genannt wird eine Veränderung nur, wenn beide Zeiträume die Mindeststichprobe erreichen (Finger wie Phase 3: 40 Intervalle bzw. 150 Anschläge; Zeichen 20 Intervalle bzw. 50 Anschläge; Dreiergruppen 8, strenger als die 4 aus Phase 3, weil zwei Mittelwerte verglichen werden), sie mindestens 10 % beträgt und deutlich über dem Zufall liegt: Fehlerquoten per Zwei-Stichproben-z-Test (z ≥ 1,96, mindestens 3 Fehler im schlechteren Zeitraum), Tempo mit angenommenem Variationskoeffizienten 0,4 je Intervall (die Kurzfassung kennt nur Summen). Angezeigt werden höchstens sechs Verbesserungen, stärkste zuerst, mit Werten vorher → nachher und „n = vorher/nachher“; Rückschritte erscheinen ruhig als „Im Blick behalten“ (höchstens drei). Ohne Übung in beiden Wochen steht ein Hinweis.
- **Rückmeldung zum Training**: Nach einem Training zeigen, ob sich die geübten Ziele gegenüber vorher bewegt haben. Prüft zugleich, ob das adaptive Training wirkt.
- **Gemeisterte Ziele**: Ein Ziel, das stabil im normalen Bereich liegt, fällt aus dem Training und erscheint in einer kleinen Liste.
- **Übungstage**: ruhiger Kalender wie ein Tagebuch, optional Tagesziel (z. B. 15 Minuten); hängt mit dem „Trainingsplan des Tages“ (Phase 3) zusammen.
- **Länge des Trainings wählbar** (Dominik, 2026-11-17, später): derzeit etwa 600 Zeichen (Drill, Sätze, Drill); ein Schalter z. B. kurz/normal/lang, der Anzahl und Länge der Abschnitte steuert.
- **Bestwerte und Meilensteine**: persönliche Bestwerte je Buch und insgesamt, Meilensteine (erstes Buch durchgetippt, 100.000 Anschläge).

---

## 8. Texte und Rechte

- Zweig (gest. 1942) ist gemeinfrei. **Ausgaben können trotzdem Rechte haben** (Edition, Rechtschreibbearbeitung, Nachwort). Jede Quelle bekommt Metadaten (Quelle, Edition, Lizenz, Abrufdatum).
- Ursprünglicher Default: kein Mitliefern von Büchern im Repository; Nutzer importieren ihre Texte selbst (EPUB/TXT). Inzwischen anders entschieden, siehe unten.
- **projekt-gutenberg.org** (seit 01.01.2026 betrieben von der Cultural Assets GmbH) erlaubt laut Nutzungsbedingungen nur den privaten Gebrauch; Vervielfältigung, Weitergabe, Veröffentlichung und Bearbeitung sind untersagt (Stand 2026-11-14). Nutzer dürfen dort geladene EPUBs also selbst importieren, mitliefern dürfen wir sie ohne Erlaubnis nicht. Dominik fragt beim Betreiber an.
- **Entschieden (Dominik, 2026-11-14): Korpus wird trotzdem mitgeliefert**, die Anfrage beim Betreiber läuft parallel. Umsetzung: `scripts/corpus.config.json` (Quelle, Kapitel ohne Autorentext wie Zeittafeln, Rechtehinweise) → `npm run corpus` → `public/corpus/*.json` + `index.json`. Die App lädt ein Buch erst auf Klick (gleiche Herkunft, keine externe Anfrage) und zeigt die Quelle an. Bücher mit ungeklärter Übersetzungsrechtslage können per `hold` zurückbleiben. *Moby Dick* (Übersetzung Wilhelm Strüver 1927/28, Lebensdaten unbekannt) hat Dominik am 2026-11-15 nach Hinweis auf das Risiko bewusst freigegeben, zusammen mit *Die Schatzinsel* (Übersetzung Heinrich Conrad). Fällt die Antwort des Betreibers negativ aus, wird `public/corpus/` entfernt. Verse behalten ihre Zeilen (2026-11-16, Hinweis eines Testers zum Rhythmus bei Faust): `<br>` im EPUB wird zum Zeilenumbruch ohne Absatzabstand (`Section.lines`); getippt wird dort wie am Absatzende ein Leerzeichen. Jedes Korpusbuch trägt eine Revision (`rev`, Prüfsumme der Abschnitte); beim Start erneuert die App gespeicherte Kopien mit anderer Revision, sofern die Abschnittszahl gleich ist (Fortschritt bleibt gültig). TXT-Import zieht Zeilen weiterhin zusammen, weil Textdateien meist hart umbrochene Prosa enthalten.
- Neue Bücher für den Korpus: bevorzugt Quellen mit klarer Lizenz (z. B. Wikisource-Texte unter freier Lizenz) und immer mit Quellenangabe in der UI. **Was aufgenommen wird, entscheidet Dominik.**

---

## 9. Nicht-funktionale Anforderungen

- **Performance**: 60 fps beim Tippen; Abschnitte bis ca. 250 Wörter (ca. 1500 Zeichen als Einzel-`<span>`) ohne Ruckeln. Bei Bedarf Rendering optimieren (nur geänderte Spans anfassen, wie im Prototyp).
- **Datenschutz**: keine externen Requests, kein Tracking, keine Cookies.
- **Qualität**: TypeScript strict, ESLint, Prettier; Unit-Tests für alle Metrik- und Analysefunktionen; Lighthouse ≥ 95 (Performance, Accessibility, Best Practices).
- **Browser**: aktuelle Versionen von Chrome, Firefox, Safari und Edge (Desktop).
- **Robustheit**: Speicherfehler (Quota) abfangen, kaputte Importdaten abweisen, nie Daten stillschweigend verlieren.

---

## 10. Arbeitsweise für Claude Code

1. Zuerst `prototype/index.html` und die Tests lesen und ausführen. Verhalten verstehen, bevor etwas umgebaut wird.
2. **Phase für Phase** arbeiten, jede in einem eigenen Branch mit kleinen, sinnvollen Commits. Nach jeder Phase lauffähigen Stand liefern.
3. **Tests zuerst** für Logik (Metriken, Segmentierung, Analyse), E2E für Abläufe.
4. Bei Unsicherheit zu Metriken, Datenmodell oder Rechten **nachfragen**, nicht raten.
5. Nach jeder Phase eine kurze Zusammenfassung: was geändert, was getestet, was Dominik manuell prüfen muss (insbesondere Tastatur-Verhalten auf echter deutscher Tastatur und Safari).
6. Keine neuen Abhängigkeiten ohne Begründung, keine Laufzeit-Requests nach außen.

---

## 11. Offene Entscheidungen (Dominik)

1. ~~**Name** des Projekts~~ → entschieden: **Typenhebel** (vorher Arbeitstitel „Anschlag“; Logo-Entwürfe in `design/`).
2. ~~**Korpus**~~ → entschieden: **mitliefern** (2026-11-14, siehe §8), dazu weiterhin Nutzer-Import.
3. ~~**Framework**~~ → entschieden: **Svelte 5** (2026-11-15, siehe §3).
4. ~~**Standardmodus**~~ → entschieden: **Strikt** (2026-11-14).
5. ~~**Sound-Default**~~ → entschieden: **an** (2026-11-14).
6. ~~**Veröffentlichung**~~ → entschieden: **öffentlich**, Repo ChaosFX/typenhebel, GitHub Pages.
7. ~~**Plattform des Alltags-Tests**~~ → entschieden: Fedora + Firefox, beruflich Windows + Edge; deutsches Layout auf Standard-ISO-Tastatur (2026-11-15, siehe §6).

---

## 12. Vorschlag für die `CLAUDE.md` im Repo

```md
# Typenhebel
Deutscher Tipptrainer (statisch, GitHub Pages, alles lokal). Spezifikation: SPEC.md.
- Sprache der UI und der Kommentare für Nutzerfunktionen: Deutsch. Code und Bezeichner: Englisch.
- src/core ist DOM-frei und vollständig getestet. Metrikdefinitionen (SPEC §5) nicht ohne Rücksprache ändern.
- Keine externen Requests, keine CDNs, keine Tracker.
- Vor jedem Commit: `npm run lint && npm test`.
- prototype/ ist Referenz und bleibt unverändert.
```
