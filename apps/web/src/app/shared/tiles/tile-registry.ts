import type { Type } from '@angular/core';
import { WeatherTileComponent } from '../../features/dashboard/tiles/weather-tile.component.js';
import { RadarTileComponent } from '../../features/dashboard/tiles/radar-tile.component.js';

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
}

export const TILE_REGISTRY: TileTypeDefinition[] = [
  { type: 'weather', component: WeatherTileComponent },
  { type: 'radar', component: RadarTileComponent },
];

export function getTileComponent(type: string): Type<unknown> | undefined {
  return TILE_REGISTRY.find((t) => t.type === type)?.component;
}

/** Privzeta razporeditev, dokler uporabnik ničesar ne shrani (Settings.tiles je prazen
 * seznam ob prvem zagonu) — spec.md, Assumptions: "v tej fazi samo vreme in radar". */
export function defaultTileLayout(): Array<{ type: string; position: number; visible: boolean }> {
  return TILE_REGISTRY.map((t, i) => ({ type: t.type, position: i, visible: true }));
}
