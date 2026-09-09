import { describe, expect, it } from 'vitest';
import { extractLinkMetadata } from '../../src/modules/saved-links/domain/link-metadata.js';

// 008: izluščenje iz HTML je edini del branja tuje strani, ki se lahko zmoti nad OBLIKO
// dokumenta — zato je čista funkcija in ima teste brez omrežja (člen IX). Vhodi so oblike, ki
// se v resničnih dokumentih pojavljajo: entitete, naslov čez več vrstic, atributi v poljubnem
// vrstnem redu, `rel="shortcut icon"`.

describe('extractLinkMetadata — naslov strani', () => {
  it('prebere <title> in dekodira entitete', () => {
    const { title } = extractLinkMetadata('<html><head><title>Vreme &amp; padavine</title></head>');
    expect(title).toBe('Vreme & padavine');
  });

  it('naslov čez več vrstic zloži v eno', () => {
    const { title } = extractLinkMetadata(`<head><title>
        Agencija za okolje
        — napoved
      </title></head>`);
    expect(title).toBe('Agencija za okolje — napoved');
  });

  it('dokument brez <title> vrne null, ne praznega niza', () => {
    // Prazen niz bi klicatelj shranil kot ime in nadomestek (gostitelj) se ne bi uporabil.
    expect(extractLinkMetadata('<html><head></head><body>brez naslova</body>').title).toBeNull();
    expect(extractLinkMetadata('<head><title>   </title></head>').title).toBeNull();
  });

  it('dekodira številčne entitete (desetiške in šestnajstiške)', () => {
    expect(extractLinkMetadata('<title>&#268;asovnik</title>').title).toBe('Časovnik');
    expect(extractLinkMetadata('<title>&#x10D;as</title>').title).toBe('čas');
  });

  it('atributi na znački <title> ne zmotijo ujemanja', () => {
    expect(extractLinkMetadata('<title data-x="1">Doma</title>').title).toBe('Doma');
  });

  it('naslov nad 200 znaki se odreže na mejo polja', () => {
    const long = 'a'.repeat(500);
    expect(extractLinkMetadata(`<title>${long}</title>`).title).toHaveLength(200);
  });
});

describe('extractLinkMetadata — favicon', () => {
  it('prebere rel="icon"', () => {
    const { faviconHref } = extractLinkMetadata('<head><link rel="icon" href="/favicon.ico"></head>');
    expect(faviconHref).toBe('/favicon.ico');
  });

  it('prebere rel="shortcut icon" — dve besedi, obe štejeta', () => {
    const { faviconHref } = extractLinkMetadata(
      '<head><link rel="shortcut icon" type="image/png" href="/i/logo.png"></head>',
    );
    expect(faviconHref).toBe('/i/logo.png');
  });

  it('href pusti RELATIVEN — razrešitev je naloga storitve, ki pozna naslov dokumenta', () => {
    const { faviconHref } = extractLinkMetadata('<link rel="icon" href="slike/ico.png">');
    expect(faviconHref).toBe('slike/ico.png');
  });

  it('atributa v obratnem vrstnem redu najde enako', () => {
    const { faviconHref } = extractLinkMetadata('<link href="/a.svg" rel="icon">');
    expect(faviconHref).toBe('/a.svg');
  });

  it('rel, ki ni ikona, prezre', () => {
    const html = '<head><link rel="canonical" href="/x"><link rel="stylesheet" href="/y.css"></head>';
    expect(extractLinkMetadata(html).faviconHref).toBeNull();
  });

  it('dokument brez značke <link> vrne null — manjkajoč favicon NI napaka (research.md §9)', () => {
    expect(extractLinkMetadata('<html><head><title>x</title></head>').faviconHref).toBeNull();
  });
});
