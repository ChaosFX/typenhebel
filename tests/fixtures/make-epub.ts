// Kleines synthetisches EPUB mit den Stolperfallen der echten Beispiele (Gutenberg-Konvertierung):
// Titelseite mit Motto, Fußnoten, Seitenanker, Verse mit <br/>, Kursiv, Tabelle, Bild, Navigation,
// Spine-Reihenfolge abweichend vom Manifest, Unterordner und URL-kodierter Dateiname.
import { strToU8, zipSync } from 'fflate';

const page = (title: string, body: string): string => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="de">
<head><meta charset="utf-8"/><title>${title}</title></head>
<body>${body}</body></html>`;

const LONG = (n: number, w: string): string => Array.from({ length: n }, (_, i) => `${w}${i}`).join(' ') + '.';

export const CHAPTER_ONE_START = 'Es war einmal ein Satz mit Fußnote, der weitergeht.';

export function makeEpub(): Uint8Array {
  const files: Record<string, Uint8Array> = {
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`),
    'OPS/book.opf': strToU8(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">test</dc:identifier>
    <dc:title>Testbuch</dc:title>
    <dc:creator>Erika Muster</dc:creator>
    <dc:publisher>Testverlag</dc:publisher>
    <dc:date>1950</dc:date>
    <dc:language>de</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c2" href="text/zwei.xhtml" media-type="application/xhtml+xml"/>
    <item id="c1" href="text/kapitel%20eins.xhtml" media-type="application/xhtml+xml"/>
    <item id="tp" href="text/titel.xhtml" media-type="application/xhtml+xml"/>
    <item id="ap" href="text/anhang.xhtml" media-type="application/xhtml+xml"/>
    <item id="img" href="img/bild.png" media-type="image/png"/>
  </manifest>
  <spine>
    <itemref idref="tp"/>
    <itemref idref="nav"/>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
    <itemref idref="ap" linear="no"/>
  </spine>
</package>`),
    'OPS/nav.xhtml': strToU8(
      page('Inhalt', '<nav epub:type="toc"><ol><li><a href="text/kapitel%20eins.xhtml">Eins</a></li></ol></nav>'),
    ),
    'OPS/text/titel.xhtml': strToU8(
      page(
        'Titelseite',
        `<h1>Titelseite</h1><h2 class="title">Testbuch</h2><p class="centersml">Erstausgabe 1950 im Testverlag</p>
<p><a id="page1" title="x"></a></p><p class="motto">»Erst die Sicherheit, <br/> dann das Tempo.«</p><p class="motto"><span class="em">Unbekannt</span></p>`,
      ),
    ),
    'OPS/text/kapitel eins.xhtml': strToU8(
      page(
        'Eins',
        `<h1>Erstes Kapitel</h1>
<div class="motto"><p class="vers">Erste Zeile <br/> zweite Zeile</p><p class="vers"><span class="em">Goethe</span></p></div>
<p></p>
<p>Es war einmal ein Satz mit Fußnote<span class="footnote">Diese Fußnote darf nicht erscheinen.</span>, der <a id="page2" title="x"></a>weitergeht.</p>
<p>Ein <span class="em">kursives</span> Wort und eine Verweisnummer<sup><a href="#fn1">1</a></sup> im Text.</p>
<p>${LONG(120, 'Wort')}</p>`,
      ),
    ),
    'OPS/text/zwei.xhtml': strToU8(
      page(
        'Zwei',
        `<h1>Zweites Kapitel</h1><p>Hiob.</p>
<table><tr><td><img src="../img/bild.png" alt="Bild"/></td><td>hebräisch</td></tr><tr><td>χητος</td><td>griechisch</td></tr></table>
<p>Ein Æquator, ein Cœur und ein Façade-Wort, dazu ½ Liter.</p>
<aside epub:type="footnote" id="fn1"><p>Endnote, die nicht erscheinen darf.</p></aside>`,
      ),
    ),
    'OPS/text/anhang.xhtml': strToU8(page('Anhang', '<h1>Anhang</h1><p>Nicht linear, wird übersprungen.</p>')),
    'OPS/img/bild.png': new Uint8Array([137, 80, 78, 71]),
  };
  return zipSync(files);
}
