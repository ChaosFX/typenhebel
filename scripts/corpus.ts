// Korpus bauen: EPUBs aus samples/ mit demselben Parser wie die App in JSON umwandeln (public/corpus/).
// Aufruf: npm run corpus [-- --list | --all]
//   --list  Kapitel je EPUB anzeigen (✗ = entfällt)
//   --all   auch zurückgehaltene Bücher (hold) bauen
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Window } from 'happy-dom';
import { wc } from '../src/core/text';
import { epubEdition, epubToBook, readEpub } from '../src/epub/import';
import { CORPUS_VERSION, type CorpusEntry, type CorpusIndex } from '../src/data/corpus';

interface ManifestEntry {
  /** Stabile ID (wird zur Buch-ID „c:<id>“ in der App) */
  id: string;
  /** Dateiname in samples/ */
  file: string;
  /** Seite der Quelle */
  url: string;
  /** Kapitel, die nicht vom Autor stammen (z. B. Zeittafeln) und deshalb entfallen */
  skip?: string[];
  title?: string;
  /** Hinweis zur Rechtelage (Übersetzer usw.) */
  note?: string;
  /** Nicht ausliefern, solange die Rechtelage ungeklärt ist (mit --all trotzdem bauen) */
  hold?: boolean;
}
interface Manifest {
  source: string;
  license: string;
  retrieved: string;
  books: ManifestEntry[];
}

export async function main(args: string[]): Promise<void> {
  const root = process.cwd();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'scripts/corpus.config.json'), 'utf8')) as Manifest;
  const parser = new new Window().DOMParser() as unknown as DOMParser;
  const list = args.includes('--list');
  const all = args.includes('--all');
  const out = path.join(root, 'public/corpus');
  if (!list) fs.mkdirSync(out, { recursive: true });
  const index: CorpusEntry[] = [];
  for (const m of manifest.books) {
    if (m.hold && !all && !list) {
      console.warn(`zurückgehalten: ${m.id} (${m.note ?? 'Rechtelage ungeklärt'})`);
      fs.rmSync(path.join(out, m.id + '.json'), { force: true });
      continue;
    }
    const file = path.join(root, 'samples', m.file);
    if (!fs.existsSync(file)) {
      console.warn(`fehlt: samples/${m.file} – übersprungen`);
      continue;
    }
    const eb = readEpub(new Uint8Array(fs.readFileSync(file)), parser);
    if (list) {
      console.log(`\n== ${m.file}: ${eb.title} – ${eb.author}`);
      for (const c of eb.chapters)
        console.log(`  ${m.skip?.includes(c.title.trim()) ? '✗' : '·'} ${c.title}  (${c.paragraphs.length} Abs.)`);
      continue;
    }
    const book = epubToBook(eb, {
      id: 'c:' + m.id,
      title: m.title,
      source: { name: manifest.source, url: m.url, edition: epubEdition(eb), license: manifest.license },
      replace: true,
      skip: m.skip,
    });
    if (!book) throw new Error(`Kein Text in ${m.file}`);
    delete book.created;
    book.rev = createHash('sha256').update(JSON.stringify(book.sections)).digest('hex').slice(0, 12);
    const json = JSON.stringify(book);
    fs.writeFileSync(path.join(out, m.id + '.json'), json);
    const words = book.sections.reduce((a, s) => a + wc(s.text), 0);
    index.push({
      id: book.id,
      file: m.id + '.json',
      title: book.title,
      author: book.author,
      chapters: book.chapters?.length ?? 0,
      sections: book.sections.length,
      words,
      bytes: Buffer.byteLength(json),
      source: { ...book.source!, retrieved: manifest.retrieved },
      note: m.note,
      rev: book.rev,
    });
    console.log(`${m.id}: ${index.at(-1)!.chapters} Kapitel, ${book.sections.length} Abschnitte, ${words} Wörter`);
  }
  if (list) return;
  const idx: CorpusIndex = {
    version: CORPUS_VERSION,
    books: index.sort((a, b) => a.author.localeCompare(b.author, 'de')),
  };
  fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(idx, null, 1) + '\n');
}
