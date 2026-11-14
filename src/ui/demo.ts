import { segment } from '../core';
import type { Book } from '../core/book';

// Demotext (eigener Platzhalter, kein Zitat)
const DEMO_PARAS = [
  'Wer zum ersten Mal an einer Schreibmaschine saß, kannte das Gefühl: Jeder Anschlag war eine kleine Entscheidung. Es gab keine Rückgängig-Taste, kein Löschen, nur das leise Rattern der Typenhebel und den Klang der Glocke am Zeilenende. Genauigkeit war keine Tugend, sondern eine Notwendigkeit.',
  'Heute tippen wir schneller und gedankenloser – und genau darin liegt die Chance. Wer langsam beginnt, die Finger ruhig führt und jeden Fehler bewusst wahrnimmt, baut ein Gedächtnis der Hände auf. „Erst die Sicherheit, dann das Tempo“, sagt man in den Kursen, und es stimmt: Die Geschwindigkeit kommt von allein.',
  'Die deutsche Sprache stellt dabei eigene Aufgaben. Umlaute wie ä, ö und ü, das scharfe ß, lange Wörter wie Donaudampfschifffahrtsgesellschaft und Satzzeichen in allen Lagen verlangen Aufmerksamkeit. Auch Zahlen (etwa 1914, 1938 oder 2026) wollen geübt sein.',
  'Übe täglich zehn Minuten, nicht eine Stunde am Wochenende. Atme ruhig, halte die Handgelenke locker und lass den Blick auf dem Text ruhen, nicht auf den Tasten.',
];

export const DEMO: Book = {
  id: 'demo',
  title: 'Demotext',
  author: 'Platzhalter – über „Text laden“ kannst du ein Kapitel aus Projekt Gutenberg einfügen',
  sections: segment(DEMO_PARAS, { min: 40, max: 140 }),
};
