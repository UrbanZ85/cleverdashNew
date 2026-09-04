import type { Type } from '@angular/core';
import { WeatherTileComponent } from '../../features/dashboard/tiles/weather-tile.component.js';
import { RadarTileComponent } from '../../features/dashboard/tiles/radar-tile.component.js';
import { ForecastTileComponent } from '../../features/dashboard/tiles/forecast-tile.component.js';
import { PluginTileComponent } from '../../features/dashboard/tiles/plugin-tile.component.js';
import { CommuteTileComponent } from '../../features/dashboard/tiles/commute-tile.component.js';
import { TodoTileComponent } from '../../features/todos/todo-tile.component.js';
import { commuteTileWidthPx } from '../../features/dashboard/commute.model.js';
import type { Settings } from '../../core/settings/settings.model.js';
import { mergeMissingTypes, type TileLayoutEntry } from './tile-layout.model.js';
import { BUILT_IN_TILE_TYPES } from './tile-types.js';

export type { TileLayoutEntry } from './tile-layout.model.js';

// FR-020: dodajanje vrste ploščice ne sme spremeniti obstoječih. `dashboard.page.ts` ne
// pozna imen "weather"/"radar" — bere samo ta register in `Settings.tiles` s strežnika.
// Dodajanje nove vrste je dodajanje enega vnosa sem, enako kot register zavihkov
// (platform/tabs/registry.ts) na strani API-ja.
//
// Ta datoteka je namenoma v shared/, ne v features/dashboard/ (kamor bi po prvem
// vtisu sodila) — potrebuje jo tudi features/settings/ (razporejanje ploščic), in
// uvoz med sosednjima zavihkoma je prepovedan (člen I, eslint.config.js). shared/
// sme uvažati iz katerekoli funkcionalnosti; obratno ne velja.
export interface TileTypeDefinition {
  type: string;
  component: Type<unknown>;
  /**
   * Želena širina v slikovnih točkah, kadar je vsebina ploščice videti narobe, če jo mreža
   * razpotegne. Brez tega vgrajena ploščica požre ves prostor, ki v vrstici ostane
   * (`flex: 1 1 var(--cd-tile-min-width)` v dashboard.page.ts) — pri ploščici z zemljevidom
   * je posledica trak čez cel zaslon, visok komaj nekaj sto pik.
   *
   * Zgornja meja, ne zagotovilo: na ožjem zaslonu se ploščica zoži (`max-width: 100%`) —
   * enako kot pri vtičnikih (`DashboardPlugin.widthPx`).
   */
  widthPx?: number;
  /**
   * Širina, ki je odvisna od uporabnikovih nastavitev — npr. ploščica "Pot" potrebuje pri
   * zemljevidih drug ob drugem dvakrat toliko prostora kot pri zemljevidih drug pod drugim.
   *
   * Funkcija in ne število zato, da nadzorna plošča ostane brez znanja o posameznih vrstah
   * ploščic (`dashboard.page.ts` ne pozna imena "commute") — vrsta pove sama, kaj potrebuje.
   * Ima prednost pred `widthPx`.
   */
  widthFromSettings?: (settings: Settings) => number;
}

export const TILE_REGISTRY: TileTypeDefinition[] = [
  { type: 'weather', component: WeatherTileComponent },
  { type: 'forecast', component: ForecastTileComponent },
  { type: 'radar', component: RadarTileComponent },
  // Zemljevida: razpotegnjena čez cel zaslon sta trak, v katerem se poti ne vidi. Širina
  // sledi uporabnikovi izbiri postavitve (drug pod drugim / drug ob drugem) — glej
  // commuteTileWidthPx().
  {
    type: 'commute',
    component: CommuteTileComponent,
    widthFromSettings: (settings) => commuteTileWidthPx(settings.commute.layout),
  },
  // 010: ploščica bere svojo nastavitev (pripeti seznam) SAMA iz Settings.tiles[].config,
  // ker nadzorna plošča vgrajenim ploščicam vhodov ne podaja in namenoma ne pozna imen vrst.
  { type: 'todos', component: TodoTileComponent },
];

/** Vrsta uporabniško definirane ploščice (005). NI v `TILE_REGISTRY`: ta seznam so
 * VGRAJENE vrste, ki jih `defaultTileLayout()` postavi na novo nadzorno ploščo in ki jih
 * zaslon za razporejanje ponudi vsem. Vtičnikov je poljubno mnogo in so osebni, zato so
 * ločena os — vsak vnos v razporeditvi nosi svoj `config.pluginId`. */
export const PLUGIN_TILE_TYPE = 'plugin';

/** Slovenski naslov vrste ploščice za nastavitve. Do zdaj je zaslon za razporejanje
 * ploščic izpisoval surov niz vrste ("weather", "radar") — angleški identifikator v
 * slovenskem vmesniku (člen X). */
export const TILE_TYPE_TITLES: Record<string, string> = {
  weather: 'Vreme',
  forecast: 'Napoved',
  radar: 'Radar padavin',
  commute: 'Pot v službo in domov',
  todos: 'Opravila',
};

export function tileTypeTitle(type: string): string {
  return TILE_TYPE_TITLES[type] ?? type;
}

export function getTileComponent(type: string): Type<unknown> | undefined {
  if (type === PLUGIN_TILE_TYPE) return PluginTileComponent;
  return TILE_REGISTRY.find((t) => t.type === type)?.component;
}

/** Želena širina vgrajene ploščice, ali `null`, kadar naj zapolni prostor v vrstici. */
export function getTileWidthPx(type: string, settings: Settings): number | null {
  const definition = TILE_REGISTRY.find((t) => t.type === type);
  if (!definition) return null;
  return definition.widthFromSettings?.(settings) ?? definition.widthPx ?? null;
}

/** Privzeta razporeditev, dokler uporabnik ničesar ne shrani (Settings.tiles je prazen
 * seznam ob prvem zagonu) — spec.md, Assumptions: "v tej fazi samo vreme in radar". */
export function defaultTileLayout(): TileLayoutEntry[] {
  return TILE_REGISTRY.map((t, i) => ({ type: t.type, position: i, visible: true }));
}

/**
 * Shranjena razporeditev, dopolnjena z VGRAJENIMI vrstami, ki jih še ne vsebuje (nove,
 * dodane po zadnji shranitvi). Ista funkcija za nadzorno ploščo in za zaslon za
 * razporejanje: prej je to logiko imel samo zaslon za razporejanje, zato je nova vrsta na
 * nadzorni plošči vzniknila šele, ko je uporabnik razporeditev enkrat shranil.
 *
 * Pravila so v `tile-layout.model.ts` (čista funkcija, tests/unit/tile-layout.spec.ts);
 * tukaj je samo vezava na register.
 */
export function withMissingBuiltIns(layout: readonly TileLayoutEntry[]): TileLayoutEntry[] {
  // Imena pridejo iz `tile-types.ts`, ne iz `TILE_REGISTRY`: isti seznam potrebuje tudi
  // ploščica sama (za pripenjanje), ta pa registra ne sme uvoziti — krožni uvoz. Da se vira ne
  // razideta, ju primerja tests/unit/tile-registry.spec.ts.
  return mergeMissingTypes(layout, BUILT_IN_TILE_TYPES);
}
