# Manuelle Tastatur-Checkliste (SPEC §6)

Pro Browser (Chrome, Firefox, Safari/macOS, Edge) mit deutscher Tastatur. Ton an, Modus wie angegeben.

| #   | Modus  | Aktion                                                                                 | Erwartung                                                    |
| --- | ------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | Strikt | `ä ö ü Ä Ö Ü ß` im Demotext tippen                                                     | jedes Zeichen genau ein Anschlag, grün                       |
| 2   | Strikt | Tottaste: `^` dann `e` → `ê`; `´` dann `e` → `é` (z. B. eigenen Text mit „Café“ laden) | ein Zeichen wird gewertet, kein Doppel-Anschlag, kein Fehler |
| 3   | Strikt | Tottaste + Leertaste (`^` + Space) bei erwartetem `^`                                  | `^` wird angenommen                                          |
| 4   | Strikt | Shift-Zeichen `" ! ? ( ) : ;`                                                          | korrekt gewertet; `"` passt auf „ und “                      |
| 5   | Strikt | AltGr-Zeichen `@ € { } [ ] \` (eigenen Text laden)                                     | korrekt gewertet, AltGr allein löst nichts aus               |
| 6   | Strikt | `-` bei erwartetem `–`                                                                 | angenommen                                                   |
| 7   | Strikt | Falsches Zeichen                                                                       | Cursor bleibt, rotes Aufblitzen, Fehlerton                   |
| 8   | Strikt | Rücktaste                                                                              | keine Wirkung                                                |
| 9   | Frei   | Fehler tippen, dann Rücktaste                                                          | Fehler rot, Rücktaste entfernt ihn                           |
| 10  | Frei   | Rücktaste bei leerem Eingabefeld (direkt nach Fokus)                                   | funktioniert trotzdem                                        |
| 11  | Frei   | Strg+Rücktaste / Alt+Rücktaste (macOS)                                                 | löscht kein Wort, höchstens ein Zeichen                      |
| 12  | beide  | Strg/Cmd+V, Text per Drag & Drop                                                       | keine Wirkung                                                |
| 13  | beide  | Enter mitten im Abschnitt                                                              | keine Wirkung                                                |
| 14  | beide  | Fenster wechseln (Alt+Tab), 10 s warten, zurück                                        | Maske „Klicke hierher…“, Zeit läuft nicht weiter             |
| 15  | beide  | Abschnitt fertig, Enter                                                                | nächster Abschnitt                                           |
| 16  | beide  | Esc                                                                                    | Abschnitt neu                                                |
| 17  | beide  | Seite neu laden                                                                        | gleicher Abschnitt, Einstellungen erhalten                   |

Abweichungen bitte mit Browser, Betriebssystem und Tastaturlayout notieren.

## EPUB-Import (Phase 1)

| #   | Aktion                                                                      | Erwartung                                                                  |
| --- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| E1  | „Text laden“ → `die-welt-von-gestern.epub` wählen                           | Hinweis „EPUB erkannt: 18 Kapitel …“, Titel und Autor ausgefüllt           |
| E2  | Laden                                                                       | Kapitelauswahl oben rechts, erstes Kapitel „Motto“ (Shakespeare)           |
| E3  | Kapitel „Die Welt der Sicherheit“ wählen                                    | beginnt mit dem Goethe-Motto, danach „Wenn ich versuche …“                 |
| E4  | Einen Abschnitt fertig tippen, Enter                                        | Kapitel-Eintrag zählt hoch (z. B. „1/48“), nächster Abschnitt              |
| E5  | Seite neu laden                                                             | gleiches Kapitel, gleicher Abschnitt, Zähler erhalten                      |
| E6  | `moby-dick-oder-der-weisse-wal.epub` laden                                  | 66 Kapitel; Hinweis auf seltene Zeichen (griechisch) mit Ersatzvorschlägen |
| E7  | Kapitel „Wortableitung“ → im Text steht „chetos“ statt „χητος“              | Ersatz wirkt                                                               |
| E8  | Beliebige andere EPUB-Datei (eigene Sammlung) laden und zwei Kapitel prüfen | keine Fußnoten, keine Seitenzahlen, keine Inhaltsverzeichnisse im Text     |
