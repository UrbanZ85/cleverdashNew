// Čista domenska plast modula (člen IX): vhod je NIZ, izhod sta dva niza. Brez omrežja in
// brez baze, zato je edini del branja tuje strani, ki se lahko zmoti nad obliko dokumenta,
// testabilen brez enega samega odhodnega klica.
//
// Zakaj regularni izraz in ne HTML razčlenjevalnik (plan.md, Technical Context): `cheerio`
// ali `parse5` bi bila nova odvisnost za DVE polji v `<head>`, ki ju iščemo v vnaprej znani
// obliki. Cena te odločitve je, da razčlenitev ni popolna — `<title>` v komentarju ali v
// `<svg>` bi jo zmotil. To je sprejemljivo, ker je izid samo PREDLOG imena, ki ga uporabnik
// vidi in lahko popravi, ne pa podatek, na katerem bi kaj slonelo.

/** Prvih toliko znakov dokumenta, v katerih iščemo. `<head>` je na začetku; brez te meje bi
 * regularni izraz tekel čez cel dokument, tudi kadar `<title>` sploh ne obstaja. */
const HEAD_SCAN_LENGTH = 64 * 1024;

/** Ime strani je omejeno enako kot polje `title` v shemi (FR-007). */
const MAX_TITLE_LENGTH = 200;

export interface LinkMetadataFields {
  /** Vsebina `<title>`, počiščena, ali `null`, kadar je dokument brez nje. */
  title: string | null;
  /** `href` iz `<link rel="icon">`, TAKŠEN, KOT JE V DOKUMENTU — relativen ostane relativen.
   * Razrešitev proti naslovu dokumenta je naloga storitve, ki naslov dokumenta pozna; ta
   * funkcija ga ne dobi in si ga ne sme izmišljati. */
  faviconHref: string | null;
}

/** Imenovane entitete, ki se v naslovih strani resnično pojavljajo. Celotne tabele HTML
 * entitet tu ni in ne sme biti — to bi bil razčlenjevalnik, ki smo se mu izognili. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Naslov strani je pogosto zapisan v več vrsticah in z zamikom; v seznamu mora biti ena
 * vrstica. Vsako zaporedje presledkov, tabulatorjev in prelomov se zloži v en presledek. */
function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

/**
 * Izlušči `<title>` in naslov favicona iz danega HTML dokumenta.
 *
 * Prazen `<title></title>` je isto kot noben — vrne `null`, ne praznega niza, sicer bi
 * klicatelj shranil zapis z imenom "" in nadomestek (gostitelj) se ne bi nikoli uporabil.
 */
export function extractLinkMetadata(html: string): LinkMetadataFields {
  const head = html.slice(0, HEAD_SCAN_LENGTH);

  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  const rawTitle = titleMatch ? collapseWhitespace(decodeEntities(titleMatch[1] ?? '')) : '';
  const title = rawTitle.length > 0 ? rawTitle.slice(0, MAX_TITLE_LENGTH) : null;

  return { title, faviconHref: extractFaviconHref(head) };
}

/**
 * `href` prve značke `<link>`, katere `rel` vsebuje `icon`.
 *
 * `rel` se preverja po BESEDAH in ne kot podniz: `rel="shortcut icon"`, `rel="apple-touch-icon"`
 * in `rel="icon shortcut"` so vse ikone, `rel="canonical"` pa ne. Vrstni red atributov v
 * znački ni določen, zato se `href` in `rel` iščeta vsak zase znotraj iste značke.
 */
function extractFaviconHref(head: string): string | null {
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1];
    if (!rel) continue;
    const isIcon = rel
      .toLowerCase()
      .split(/\s+/)
      .some((word) => word === 'icon' || word.endsWith('-icon'));
    if (!isIcon) continue;

    const href = /\bhref\s*=\s*["']?([^"'>\s]+)/i.exec(tag)?.[1];
    if (href) return decodeEntities(href.trim());
  }
  return null;
}
