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
- UI-Framework: zunächst **kein Framework** (Vanilla TS mit kleinen Modulen). Falls der Zustand unübersichtlich wird, Svelte erwägen, dann aber Rücksprache.
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
│  ├─ ui/                     # Rendering: Text, Cursor, Ergebnis, Dialoge
│  ├─ audio/sound.ts
│  ├─ data/db.ts              # Dexie-Schema, Migrationen, Export/Import
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
- **Testmatrix**: Chrome, Firefox, Safari (macOS), jeweils mit deutscher Tastatur inkl. Tottasten, `ß`, `ä ö ü`, `Shift`-Zeichen, `AltGr`-Zeichen (`@ € { }`). Diese Prüfung kann Claude Code nicht vollständig automatisieren. Dominik testet manuell, Claude Code liefert dafür eine kurze Checkliste.

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

### Phase 2: Persistenz
- Migration von localStorage nach IndexedDB (Dexie), Bücher/Abschnitte getrennt von Sessions und Profil.
- Rohdaten (`events`) nur für die letzten 30 Sessions, ältere werden zu Aggregaten verdichtet.
- Export/Import als JSON (Profil, Sessions, optional Bücher), Import mit Versionsprüfung und Zusammenführen statt Überschreiben.
- Hinweis in der UI, dass Browserdaten gelöscht werden können; Erinnerung zum Export alle ~30 Sessions.

### Phase 3: Analyse v2 und adaptives Training
- `keyboard.ts`: QWERTZ-Zuordnung Zeichen → Finger/Hand/Reihe, Nachbartasten, Shift-Seite.
- **Fehlerarten** klassifizieren: Nachbartaste getroffen, Vertauschung zweier Zeichen, Auslassung, Doppelanschlag, Groß-/Kleinschreibung (Shift), Umlaut-Fehler.
- Auswertungen: Tempo und Fehler **pro Finger/Hand**, langsame **Trigramme** und **Wortanfänge/-enden**, **Post-Error-Slowing** (Verlangsamung nach Fehlern), **Ermüdung** (Verlauf innerhalb der Session), Trend über Tage.
- Statistik robust halten: Median statt Mittel wo möglich, **Glättung der Fehlerraten** (z. B. Wilson-Intervall oder Beta-Prior), Mindeststichproben, Hinweise „vorläufig“ bei geringer Datenlage. Keine Aussage ohne Datenbasis.
- **Adaptive Übungen**: Aus dem Korpus Abschnitte/Sätze wählen, die die Schwach-Bigramme und -Zeichen des Profils enthalten (Scoring und Ranking). Zusätzlich „Wort-Drills“ als kurze Übungsmodi. Optional „Trainingsplan des Tages“.
- Jede Empfehlung zeigt ihre Begründung („weil …, n = …“).
- Akzeptanz: Mit synthetisch erzeugten Events (Unit-Tests) liefert die Analyse reproduzierbar die eingebauten Schwächen (z. B. künstlich langsamer Ringfinger).

### Phase 4: Gestaltung und Barrierefreiheit
- **Schrift selbst hosten** (z. B. Literata, OFL-Lizenz, WOFF2 mit Subset für Latein + deutsche Zeichen). Keine Google-Fonts-Einbindung (DSGVO-Abmahnrisiko).
- Sound: bessere, leise Klang-Samples oder weiterhin synthetisch; Lautstärkeregler; Sound standardmäßig an, aber dezent.
- Fokus-Modus (alles außer Text ausblenden), Textgröße einstellbar, zusätzlicher Farbmodus (Sepia).
- `prefers-reduced-motion`, ausreichend Kontrast (WCAG AA für Text), sichtbare Fokusrahmen, sinnvolle ARIA-Rollen für Dialoge.
- Die Optik darf besser werden, aber Charakter beibehalten: ruhig, warm, buchartig.

### Phase 5: PWA und Rechtliches
- Service Worker, installierbar, offline lauffähig.
- Seite „Datenschutz“: keine Datenübertragung, keine Cookies, nur lokale Speicherung. Prüfen, ob für die öffentliche Seite ein Impressum nötig ist (Dominik klärt das selbst).
- Lizenz für den Code (Vorschlag: MIT), Lizenzübersicht für Schriften und Texte.
- Content-Security-Policy per `<meta>`, die externe Requests verbietet.

---

## 8. Texte und Rechte

- Zweig (gest. 1942) ist gemeinfrei. **Ausgaben können trotzdem Rechte haben** (Edition, Rechtschreibbearbeitung, Nachwort). Jede Quelle bekommt Metadaten (Quelle, Edition, Lizenz, Abrufdatum).
- **Default: kein Mitliefern von Büchern im Repository.** Nutzer importieren ihre Texte selbst (EPUB/TXT). Das ist rechtlich am einfachsten.
- Falls später ein eingebauter Korpus gewünscht ist: nur Quellen mit klarer Lizenz (z. B. Wikisource-Texte unter freier Lizenz, geprüfte Gutenberg-Ausgaben) und mit Quellenangabe in der UI. **Das entscheidet Dominik**, Claude Code legt nur die technische Möglichkeit an (`public/corpus/*.json` + Index).

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
2. **Korpus**: Nur Nutzer-Import oder später eingebauter, lizenzgeprüfter Korpus?
3. **Framework**: Vanilla TS beibehalten oder Svelte?
4. **Standardmodus**: Strikt (Genauigkeit zuerst) oder Frei?
5. **Sound-Default**: an oder aus?
6. **Veröffentlichung**: Öffentliche GitHub-Seite oder zunächst nur privat/lokal?
7. **Plattform des Alltags-Tests**: Welche Tastatur(en) und Betriebssysteme nutzt du? Bestimmt die Testmatrix.

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
