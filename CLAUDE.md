# Typenhebel

Deutscher Tipptrainer (statisch, GitHub Pages, alles lokal). Spezifikation: SPEC.md.

- Sprache der UI und der Kommentare für Nutzerfunktionen: Deutsch. Code und Bezeichner: Englisch.
- src/core ist DOM-frei und vollständig getestet. Metrikdefinitionen (SPEC §5) nicht ohne Rücksprache ändern.
- Oberfläche in Svelte 5 (Runes): Zustand in src/app/state.svelte.ts, Komponenten in src/components/. Der Tipp-Hotpath (src/app/typing.svelte.ts) bleibt imperativ. `npm run lint` enthält svelte-check.
- Keine externen Requests, keine CDNs, keine Tracker.
- Vor jedem Commit: `npm run lint && npm test`. E2E: `npm run e2e` (enthält Screenshot-Vergleich mit prototype/).
- prototype/ ist Referenz und bleibt unverändert. `npm run test:proto` prüft dessen Kernlogik.
- samples/ (EPUBs) ist per .gitignore ausgeschlossen: Ausgaben können Rechte haben (SPEC §8).
