// Čisti podatkovni model in logika zlivanja nastavitev — BREZ uvozov iz @angular/*.
//
// Ločeno od settings.store.ts namenoma: shramba uvaža HttpClient, kar ob uvozu modula
// zahteva Angularjev JIT prevajalnik, in enotni testi v apps/web/tests/unit/ tečejo brez
// TestBed-a (glej network-status.service.spec.ts za isti vzorec). Tako je vsa logika, ki
// se lahko zmoti, preverljiva brez ogrodja.

export type ThemePreference = 'system' | 'light' | 'dark';

export interface TileEntry {
  type: string;
  position: number;
  visible: boolean;
  config?: Record<string, unknown>;
}

export interface TabOverride {
  enabled?: boolean;
  order?: number;
}

/** Osebni URL-ji virov. Prazno/odsotno polje pomeni "uporabi sistemski privzetek iz .env" —
 * strežnik razreši `Settings.sources.* ?? env.*` (glej modules/dashboard/router.ts). */
export interface SourceOverrides {
  weatherUrl?: string | null;
  radarUrl?: string | null;
  webcamBaseUrl?: string | null;
}

/** 007: privolitev, da zvočni posnetek beležke zapusti strežnik in gre k zunanji storitvi za
 * prepis. Ločena od tega, ali je ključ nastavljen v okolju — ključ je dovoljenje namestitve,
 * to stikalo pa privolitev osebe (glej apps/api/src/modules/notes/domain/transcription-gate.ts). */
export interface NotesSettings {
  serverTranscription: boolean;
}

/** Kraj za ploščico "Pot": naslov ALI koordinati. `null` pomeni "ni nastavljeno". */
export interface CommutePlaceSettings {
  label: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** Zemljevida drug pod drugim ali drug ob drugem. */
export type CommuteLayout = 'vertical' | 'horizontal';

/**
 * Meje višine zemljevida. Spodnja je toliko, da je na zemljevidu še kaj videti, zgornja
 * toliko, da ena ploščica ne zasede cele nadzorne plošče. Isti števili uveljavlja strežnik
 * (apps/api/src/modules/settings/services/commute-settings.service.ts).
 *
 * Živijo v `core/`, ne v modulu nadzorne plošče: potrebujeta jih DVA zavihka — ploščica
 * (features/dashboard) in obrazec (features/settings) — uvoz med zavihkoma pa je prepovedan
 * (člen I, eslint `cleverdash/module-boundary`).
 */
export const MIN_MAP_HEIGHT_PX = 100;
export const MAX_MAP_HEIGHT_PX = 600;
export const DEFAULT_MAP_HEIGHT_PX = 170;

/** Višina znotraj dogovorjenih mej; nesmiselna vrednost (0, NaN, 5000) se ne izriše. */
export function clampMapHeightPx(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_MAP_HEIGHT_PX;
  return Math.min(Math.max(Math.round(value), MIN_MAP_HEIGHT_PX), MAX_MAP_HEIGHT_PX);
}

/** Kraja ploščice "Pot" na nadzorni plošči in videz ploščice. Smeri (v službo / domov) se iz
 * krajev izpeljeta na strežniku (`GET /dashboard/commute`) — tu se hranita samo kraja in to,
 * kako naj bosta zemljevida videti. */
export interface CommuteSettings {
  home: CommutePlaceSettings;
  work: CommutePlaceSettings;
  /** Višina posameznega zemljevida v slikovnih točkah. */
  mapHeightPx: number;
  layout: CommuteLayout;
}

export interface Settings {
  weather: { locationName: string; latitude: number; longitude: number };
  theme: ThemePreference;
  tiles: TileEntry[];
  tabs: Record<string, TabOverride>;
  sources: SourceOverrides;
  cameraDataSaverEnabled: boolean;
  notes: NotesSettings;
  commute: CommuteSettings;
}

export type SettingsPatch = {
  weather?: Partial<Settings['weather']>;
  theme?: ThemePreference;
  tiles?: TileEntry[];
  tabs?: Record<string, TabOverride>;
  sources?: SourceOverrides;
  cameraDataSaverEnabled?: boolean;
  notes?: Partial<NotesSettings>;
  /** Po krajih in po polju delno: `{ commute: { work: { label } } }` spremeni samo ime službe. */
  commute?: {
    home?: Partial<CommutePlaceSettings>;
    work?: Partial<CommutePlaceSettings>;
    mapHeightPx?: number;
    layout?: CommuteLayout;
  };
};

/** Uporabno stanje, dokler strežnik ne odgovori — nikoli prazen zaslon (FR-026 duh). */
export const SETTINGS_DEFAULTS: Settings = {
  weather: { locationName: 'Ljubljana', latitude: 46.0629, longitude: 14.5602 },
  theme: 'system',
  tiles: [],
  tabs: {},
  sources: {},
  cameraDataSaverEnabled: true,
  notes: { serverTranscription: false },
  commute: {
    home: { label: 'Doma', address: null, latitude: null, longitude: null },
    work: { label: 'Služba', address: null, latitude: null, longitude: null },
    mapHeightPx: 170,
    layout: 'vertical',
  },
};

export function mergeWithDefaults(raw: Partial<Settings> | null | undefined): Settings {
  return {
    weather: { ...SETTINGS_DEFAULTS.weather, ...(raw?.weather ?? {}) },
    theme: raw?.theme ?? SETTINGS_DEFAULTS.theme,
    tiles: raw?.tiles ?? [],
    tabs: raw?.tabs ?? {},
    sources: raw?.sources ?? {},
    cameraDataSaverEnabled: raw?.cameraDataSaverEnabled ?? SETTINGS_DEFAULTS.cameraDataSaverEnabled,
    notes: { ...SETTINGS_DEFAULTS.notes, ...(raw?.notes ?? {}) },
    commute: {
      home: { ...SETTINGS_DEFAULTS.commute.home, ...(raw?.commute?.home ?? {}) },
      work: { ...SETTINGS_DEFAULTS.commute.work, ...(raw?.commute?.work ?? {}) },
      mapHeightPx: raw?.commute?.mapHeightPx ?? SETTINGS_DEFAULTS.commute.mapHeightPx,
      layout: raw?.commute?.layout ?? SETTINGS_DEFAULTS.commute.layout,
    },
  };
}

export function applyPatch(current: Settings, patch: SettingsPatch): Settings {
  return {
    weather: { ...current.weather, ...(patch.weather ?? {}) },
    theme: patch.theme ?? current.theme,
    tiles: patch.tiles ?? current.tiles,
    // Prekritja zavihkov se zlijejo PO ZAVIHKIH, enako kot na strežniku (settings/router.ts)
    // — delno prekritje (samo `enabled`) ne sme pobrisati shranjenega `order`.
    tabs: patch.tabs
      ? Object.fromEntries(
          Object.entries({ ...current.tabs, ...patch.tabs }).map(([id, override]) => [
            id,
            { ...(current.tabs[id] ?? {}), ...override },
          ]),
        )
      : current.tabs,
    sources: patch.sources ? { ...current.sources, ...patch.sources } : current.sources,
    cameraDataSaverEnabled: patch.cameraDataSaverEnabled ?? current.cameraDataSaverEnabled,
    notes: { ...current.notes, ...(patch.notes ?? {}) },
    // Zlitje PO KRAJIH in po polju: shranjevanje enega kraja (ali samo njegovega imena) ne
    // sme pobrisati drugega — enako ravna strežnik (settings/router.ts).
    commute: {
      home: { ...current.commute.home, ...(patch.commute?.home ?? {}) },
      work: { ...current.commute.work, ...(patch.commute?.work ?? {}) },
      mapHeightPx: patch.commute?.mapHeightPx ?? current.commute.mapHeightPx,
      layout: patch.commute?.layout ?? current.commute.layout,
    },
  };
}
