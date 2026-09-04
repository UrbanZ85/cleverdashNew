// Čista logika za pripravo prilepljenega naslova vdelave — BREZ uvozov iz @angular/*, enak
// vzorec kot core/settings/settings.model.ts in core/network/network-status.service.ts, da
// je preverljiva brez TestBed-a.
//
// Živi v `core/`, ne v modulu kamer, ker isto potrebujeta DVA modula: kamere (vrsta vira
// "vdelava tuje strani") in nadzorna plošča (vtičnik vrste `iframe`). Modul ne sme uvažati
// iz modula (člen I, eslint `cleverdash/module-boundary`), skupna pot je `core/`.
//
// Zakaj obstaja: YouTube pod "Deli → Vdelaj" ponudi CEL `<iframe ...>`, ne naslova, pod
// "Deli" pa naslov oblike `youtu.be/ID` ali `watch?v=ID`. Prvo ni URL in ga strežniška
// validacija (api: domain/camera-validation.ts) zavrne z "Naslov predogleda ni veljaven
// URL". Drugo JE veljaven URL in se shrani, a ga YouTube v okvirju zavrne
// (X-Frame-Options) — ploščica ostane prazna, brez pojasnila. Oboje je za uporabnika
// enako: "ne dela".
//
// Popravek se zgodi v obrazcu in ne na strežniku namenoma: v polju se pokaže naslov, ki bo
// zares shranjen, zato uporabnik vidi, kaj se je spremenilo, in lahko popravek razveljavi.

/** Kaj se je pri pripravi naslova spremenilo — obrazec iz tega sestavi sporočilo. */
export type EmbedAddressNote = 'extracted-from-iframe' | 'youtube-to-embed';

export interface NormalizedEmbedAddress {
  /** Naslov, kot naj se shrani. Enak (obrezanemu) vhodu, če ni bilo kaj popraviti. */
  url: string;
  notes: EmbedAddressNote[];
}

const YOUTUBE_HOSTS = ['youtube.com', 'youtube-nocookie.com'] as const;
const YOUTUBE_SHORT_HOSTS = ['youtu.be'] as const;
/** Poti, ki že nosijo oznako posnetka kot zadnji člen: `/embed/ID`, `/live/ID`, `/shorts/ID`, `/v/ID`. */
const ID_PATH_PREFIXES = ['embed', 'live', 'shorts', 'v'] as const;
/** `v` se prenese v pot, `si` je sledilni žeton iz gumba "Deli" — v naslovu za vdelavo sta brez pomena. */
const DROPPED_PARAMS = ['v', 'si'] as const;

function hostMatches(hostname: string, bases: readonly string[]): boolean {
  const host = hostname.toLowerCase();
  return bases.some((base) => host === base || host.endsWith(`.${base}`));
}

function parse(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * Iz prilepljenega `<iframe ...>` izlušči vrednost `src`. Namenoma NE razčlenjuje HTML —
 * vhod je ena sama oznaka iz gumba "Vdelaj", ne dokument, in rezultat gre takoj skozi
 * `new URL()`, torej se neveljaven izsek ustavi tam.
 */
export function extractIframeSrc(raw: string): string | null {
  const match = /<iframe\b[^>]*?\bsrc\s*=\s*("([^"]*)"|'([^']*)')/i.exec(raw);
  const src = match?.[2] ?? match?.[3];
  if (!src) return null;
  // Znotraj HTML atributa je `&` zapisan kot `&amp;` — brez tega bi bili parametri po prvem
  // popačeni ("&amp;autoplay=1" kot ime parametra).
  return src.trim().replace(/&amp;/gi, '&');
}

/** Oznaka posnetka iz katerekoli YouTube oblike naslova, ali `null`, če to ni YouTube. */
export function youtubeVideoId(url: URL): string | null {
  const segments = url.pathname.split('/').filter((s) => s.length > 0);
  if (hostMatches(url.hostname, YOUTUBE_SHORT_HOSTS)) {
    return segments[0] ?? null;
  }
  if (!hostMatches(url.hostname, YOUTUBE_HOSTS)) return null;
  if (segments[0] === 'watch') return url.searchParams.get('v');
  if (segments.length === 2 && (ID_PATH_PREFIXES as readonly string[]).includes(segments[0]!)) {
    return segments[1] ?? null;
  }
  return null;
}

/**
 * `true`, če ta gostitelj slike posnetka ne more vrniti in ima smisel samo kot vdelava —
 * obrazec ob tem sam preklopi vrsto vira, ker bi `snapshot` nad YouTube naslovom shranil
 * kamero, ki se izriše kot pokvarjena slika (in strežnik tega ne zavrne, ker se seznam
 * dovoljenih gostiteljev preverja samo pri vrstah za vdelavo).
 */
export function isEmbedOnlyAddress(raw: string): boolean {
  const url = parse(raw.trim());
  if (!url) return false;
  return hostMatches(url.hostname, YOUTUBE_HOSTS) || hostMatches(url.hostname, YOUTUBE_SHORT_HOSTS);
}

/**
 * Pripravi prilepljeno vrednost za shranjevanje: iz `<iframe>` vzame `src`, YouTube naslov
 * za gledanje pa pretvori v naslov za vdelavo. Vse drugo pusti pri miru — ta funkcija
 * naslova NE preverja (to je naloga strežnika, FR-034), samo popravi obliki, ki sta znano
 * napačni.
 */
export function normalizeEmbedAddress(raw: string): NormalizedEmbedAddress {
  const notes: EmbedAddressNote[] = [];
  let value = raw.trim();

  const iframeSrc = extractIframeSrc(value);
  if (iframeSrc) {
    value = iframeSrc;
    notes.push('extracted-from-iframe');
  }

  const url = parse(value);
  if (!url) return { url: value, notes };

  const videoId = youtubeVideoId(url);
  const alreadyEmbed = url.pathname.split('/').filter((s) => s.length > 0)[0] === 'embed';
  if (videoId && !alreadyEmbed) {
    // Kratki `youtu.be` gostitelj vdelave ne streže — pot mora dobiti tudi novo domeno.
    const origin = hostMatches(url.hostname, YOUTUBE_SHORT_HOSTS) ? 'https://www.youtube.com' : url.origin;
    const embed = new URL(`${origin}/embed/${videoId}`);
    for (const [key, param] of url.searchParams) {
      if (!(DROPPED_PARAMS as readonly string[]).includes(key)) embed.searchParams.set(key, param);
    }
    value = embed.toString();
    notes.push('youtube-to-embed');
  }

  return { url: value, notes };
}


// ─────────────────────────── atributi našega `<iframe>` ───────────────────────────
//
// POZOR: obe vrednosti se v predlogah zapišeta STATIČNO (`referrerpolicy="…"`, `allow="…"`)
// in NE kot vezava na te konstanti. Angular vezavo obeh atributov na <iframe> zavrne z
// NG0910 ("can be set on the <iframe> element as a static attribute only"), in ker napaka
// nastane med izrisom, je posledica prazen okvir: pri vtičniku jo ujame `app-tile-host` in
// ploščica se izriše kot pokvarjena, pri kameri pa ostane prikaz prazen. Konstanti sta zato
// kanonični zapis odločitve in vhod v tests/unit/embed-iframe-attributes.spec.ts, ki
// preveri, da se predlogi od njiju ne razideta — nista vrednost, ki bi jo predloga brala.
//
// `referrerpolicy="no-referrer"` je bil videti kot varnejša izbira, a tuje predvajalnike
// zlomi: YouTube brez glave `Referer` vrne "Napaka 153 — napaka pri konfiguriranju
// videopredvajalnika" in ploščica ostane črna. Preverjeno v Chromiumu na treh različicah
// istega okvirja (isti `src`, ista peskovnik nastavitev): z `no-referrer` napaka 153, s
// `strict-origin-when-cross-origin` in z YouTubovim lastnim naborom atributov pa predvajanje.
//
// `strict-origin-when-cross-origin` je privzetek modernih brskalnikov in tisto, kar YouTube
// ponudi v svoji kodi za vdelavo: tuja stran izve SAMO naš izvor (shema + gostitelj), nikoli
// poti do ploščice. To je zavestna menjava — brez tega vdelave, ki referer preverjajo, ne
// delujejo, in uporabnik dobi črn okvir brez pojasnila.
export const EMBED_REFERRER_POLICY = 'strict-origin-when-cross-origin';

/** Zmožnosti, ki jih vdelanemu predvajalniku podelimo. Brez `fullscreen` gumb za cel zaslon
 * v predvajalniku ne stori nič, brez `encrypted-media` zaščitena vsebina ne steče, brez
 * `autoplay` živi tok čaka na klik. Mikrofon, kamera in geolokacija NISO na seznamu — vdelava
 * jih ne potrebuje. */
export const EMBED_ALLOW = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
