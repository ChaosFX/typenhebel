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
