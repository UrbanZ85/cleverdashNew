// Čisti model vtičnika — brez uvozov iz @angular/*, da je preverljiv brez TestBed-a
// (isti razlog kot pri core/settings/settings.model.ts).

export const PLUGIN_KINDS = ['link', 'iframe', 'image', 'json'] as const;
export type PluginKind = (typeof PLUGIN_KINDS)[number];

export interface PluginField {
  label: string;
  /** Pikčasta pot v odgovoru vira, npr. `observation.t`. */
  path: string;
  unit: string | null;
}

export interface DashboardPlugin {
  id: string;
  name: string;
  icon: string;
  kind: PluginKind;
  url: string;
  openInNewTab: boolean;
  description: string | null;
  heightPx: number;
  /** Širina ploščice v slikovnih točkah. Zgornja meja, ne zagotovilo: na ožjem zaslonu se
   * ploščica zoži na razpoložljivo širino (glej dashboard.page.ts). */
  widthPx: number;
  refreshSeconds: number;
  alt: string | null;
  fields: PluginField[];
}

/** Kar se pošlje na POST/PUT — brez polj, ki jih določi strežnik. */
export type PluginDraft = Omit<DashboardPlugin, 'id'>;

export const PLUGIN_KIND_TITLES: Record<PluginKind, string> = {
  link: 'Povezava',
  iframe: 'Vdelana stran',
  image: 'Slika',
  json: 'Podatek iz JSON',
};

export const PLUGIN_KIND_HINTS: Record<PluginKind, string> = {
  link: 'Kartica z gumbom, ki odpre naslov.',
  iframe: 'Tuja stran, vdelana v ploščico.',
  image: 'Zunanja slika, ki se sama osvežuje (npr. radar ali spletna kamera).',
  json: 'Iz odgovora JSON izpiše izbrana polja — vsakemu daš oznako in pot.',
};

/** Vrste, ki jih je smiselno odpreti povečano. `link` ne: klik nanj odpre naslov sam. */
export function canOpenEnlarged(kind: PluginKind): boolean {
  return kind !== 'link';
}

/** Meje širine ploščice. Spodnja je toliko, da ploščica ostane berljiva, zgornja pa toliko,
 * kolikor je široka sama nadzorna plošča (`.dash { max-width: 1600px }`). Ista števila
 * uveljavlja strežnik (plugins.router.ts) — tu so zato, da uporabnik napako vidi takoj. */
export const MIN_TILE_WIDTH_PX = 200;
export const MAX_TILE_WIDTH_PX = 1600;
/** Privzetek je enak `--cd-tile-min-width` — nov vtičnik je tako širok kot vgrajene ploščice. */
export const DEFAULT_TILE_WIDTH_PX = 320;

export const PLUGIN_KIND_ICONS: Record<PluginKind, string> = {
  link: 'link-outline',
  iframe: 'browsers-outline',
  image: 'image-outline',
  json: 'code-slash-outline',
};

/** Vrsti, ki ju prenese strežnik (člen VIII: odjemalec ne kliče zunanjega vira sam). */
export function fetchesThroughServer(kind: PluginKind): boolean {
  return kind === 'image' || kind === 'json';
}

export function emptyDraft(): PluginDraft {
  return {
    name: '',
    icon: 'apps-outline',
    kind: 'link',
    url: '',
    openInNewTab: true,
    description: null,
    heightPx: 320,
    widthPx: DEFAULT_TILE_WIDTH_PX,
    refreshSeconds: 300,
    alt: null,
    fields: [],
  };
}

/**
 * Predpreveri osnutek, preden gre na strežnik — da uporabnik dobi sporočilo takoj in v
 * polju, kjer je napaka. Strežnik preveri isto znova (`domain/outbound-url.ts`,
 * `plugins.router.ts`); ta funkcija NI varnostna meja, samo hitrejša povratna informacija.
 */
export function validateDraft(draft: PluginDraft): string | null {
  if (draft.name.trim().length === 0) return 'Vtičnik potrebuje ime.';
  if (draft.url.trim().length === 0) return 'Vtičnik potrebuje naslov.';

  let parsed: URL;
  try {
    parsed = new URL(draft.url.trim());
  } catch {
    return 'Naslov ni veljaven URL — začeti mora z https://';
  }
  if (parsed.protocol !== 'https:') return 'Dovoljen je samo https.';

  if (draft.kind === 'json') {
    if (draft.fields.length === 0) return 'Za vrsto "Podatek iz JSON" dodaj vsaj eno polje.';
    const unnamed = draft.fields.find((f) => f.label.trim().length === 0 || f.path.trim().length === 0);
    if (unnamed) return 'Vsako polje potrebuje oznako in pot.';
  }

  if (fetchesThroughServer(draft.kind) && draft.refreshSeconds < 30) {
    return 'Najkrajši interval osveževanja je 30 sekund.';
  }

  if (!Number.isInteger(draft.widthPx) || draft.widthPx < MIN_TILE_WIDTH_PX || draft.widthPx > MAX_TILE_WIDTH_PX) {
    return `Širina ploščice mora biti med ${MIN_TILE_WIDTH_PX} in ${MAX_TILE_WIDTH_PX} px.`;
  }

  return null;
}
