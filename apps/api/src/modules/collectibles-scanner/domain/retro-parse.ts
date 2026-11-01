import type { RetroCompleteness, RetroKind, RetroRegion, RetroWorking } from './types.js';
import { hasWord, normalizeText } from './text.js';

// Razčlenitev naslova oglasa za retro igre in konzole (019, research §9). Čista funkcija: vrne samo to,
// kar naslov izrecno pove; regija, popolnost in delovanje se ne domnevajo (FR-016).

/** Platforme: ključ → vzdevki (normalizirani). Vrstni red je pomemben (daljše oznake prej). */
export const RETRO_PLATFORMS: ReadonlyArray<{ id: string; label: string; aliases: string[] }> = [
  { id: 'snes', label: 'Super Nintendo', aliases: ['super nintendo', 'super nes', 'snes', 'super famicom', 'sfc'] },
  { id: 'nes', label: 'Nintendo NES', aliases: ['nintendo entertainment system', 'nes', 'famicom'] },
  { id: 'n64', label: 'Nintendo 64', aliases: ['nintendo 64', 'n64'] },
  { id: 'gba', label: 'Game Boy Advance', aliases: ['game boy advance', 'gameboy advance', 'gba'] },
  { id: 'gbc', label: 'Game Boy Color', aliases: ['game boy color', 'gameboy color', 'game boy colour', 'gameboy colour', 'gbc'] },
  { id: 'gb', label: 'Game Boy', aliases: ['game boy', 'gameboy', 'gb', 'dmg'] },
  { id: 'gamecube', label: 'Nintendo GameCube', aliases: ['gamecube', 'game cube', 'ngc', 'gc'] },
  { id: 'wii', label: 'Nintendo Wii', aliases: ['wii'] },
  { id: 'ds', label: 'Nintendo DS', aliases: ['nintendo ds', 'ds lite', 'dsi', '3ds', 'nds', 'ds'] },
  { id: 'md', label: 'Sega Mega Drive', aliases: ['mega drive', 'megadrive', 'genesis', 'sega genesis'] },
  { id: 'saturn', label: 'Sega Saturn', aliases: ['sega saturn', 'saturn'] },
  { id: 'dreamcast', label: 'Sega Dreamcast', aliases: ['dreamcast', 'sega dreamcast'] },
  { id: 'ps1', label: 'PlayStation', aliases: ['playstation 1', 'ps1', 'psx', 'psone', 'playstation'] },
  { id: 'ps2', label: 'PlayStation 2', aliases: ['playstation 2', 'ps2'] },
  { id: 'psp', label: 'PlayStation Portable', aliases: ['psp', 'playstation portable'] },
];

export interface ParsedRetro {
  platform: string | null;
  region: RetroRegion | null;
  kind: RetroKind | null;
  completeness: RetroCompleteness | null;
  working: RetroWorking | null;
  /** Reprodukcija, bootleg, "custom", ponaredek. */
  reproduction: boolean;
  /** Več predmetov v enem oglasu. */
  lot: boolean;
  /** Nastavljene so bile besede, ki jih ni mogoče razvrstiti kot igro ali konzolo (npr. samo "Nintendo"). */
  rest: string;
}

function platformOf(text: string): string | null {
  const padded = ` ${text} `;
  let best: { id: string; len: number } | null = null;
  for (const p of RETRO_PLATFORMS) {
    for (const alias of p.aliases) {
      if (padded.includes(` ${alias} `) && (!best || alias.length > best.len)) best = { id: p.id, len: alias.length };
    }
  }
  return best?.id ?? null;
}

export function parseRetroTitle(title: string, description?: string | null): ParsedRetro {
  const text = normalizeText(description ? `${title} ${description}` : title);
  const t = normalizeText(title);

  const platform = platformOf(t) ?? platformOf(text);

  let region: RetroRegion | null = null;
  const jp = hasWord(text, 'ntsc j', 'ntsc-j', 'jap', 'japan', 'japanese', 'japanisch', 'jpn', 'jp', 'jpn version');
  // Samo "NTSC" brez črke ne pove regije (J ali U): ostane neznano.
  const us = hasWord(text, 'ntsc u', 'ntsc-u', 'usa', 'us', 'ntsc u/c', 'north america', 'american');
  const pal = hasWord(text, 'pal', 'eur', 'euro', 'europe', 'european', 'uk', 'pal-a', 'pal-b', 'ukv', 'fah', 'fra', 'ger', 'ita', 'esp');
  const hits = [jp, us, pal].filter(Boolean).length;
  if (hits === 1) region = jp ? 'NTSC-J' : us ? 'NTSC-U' : 'PAL';

  let kind: RetroKind | null = null;
  const consoleWords = hasWord(t, 'console', 'konsole', 'system', 'konzola', 'handheld', 'konsol', 'konsolen');
  const accessory = hasWord(t, 'controller', 'gamepad', 'netzteil', 'charger', 'cable', 'kabel', 'adapter', 'memory card', 'rumble pak', 'expansion pak', 'zapper', 'tasche', 'case', 'hulle', 'ladegerat');
  const gameWords = hasWord(t, 'game', 'spiel', 'cartridge', 'cart', 'modul', 'modul only', 'disc', 'cib', 'igra');
  if (accessory && !consoleWords) kind = 'accessory';
  else if (consoleWords && !gameWords) kind = 'console';
  else if (gameWords && !consoleWords) kind = 'game';
  else if (consoleWords && gameWords) kind = null;

  let completeness: RetroCompleteness | null = null;
  // "NEU" samo po sebi ni zapečatenost (lahko je odprto, "neu in OVP"): zapečateno je samo izrecno.
  const sealed = hasWord(text, 'sealed', 'factory sealed', 'new sealed', 'versiegelt', 'zapecateno', 'zapecaten', 'sigillato', 'precintado', 'scelle');
  const cib = hasWord(text, 'cib', 'complete in box', 'komplett', 'complete', 'mit ovp', 'mit anleitung', 'with manual', 'in box', 'boxed', 'compl');
  const loose = hasWord(text, 'loose', 'cart only', 'cartridge only', 'nur modul', 'ohne ovp', 'modul only', 'disc only', 'only disc', 'only cart', 'no box', 'ohne anleitung', 'nur spiel', 'bez skatle', 'solo cartuccia');
  if (sealed && !cib && !loose) completeness = 'sealed';
  else if (loose && !cib) completeness = 'loose';
  else if (cib && !loose) completeness = hasWord(text, 'cib', 'complete in box', 'komplett', 'complete', 'compl') ? 'cib' : 'boxed';
  else if (hasWord(text, 'box only', 'nur ovp', 'only box')) completeness = null;

  let working: RetroWorking | null = null;
  if (hasWord(text, 'defekt', 'defective', 'broken', 'for parts', 'parts only', 'not working', 'nicht funktionsfahig', 'bastler', 'kaputt', 'faulty', 'spares or repair', 'untested broken')) working = 'not-working';
  else if (hasWord(text, 'untested', 'ungetestet', 'nicht getestet', 'as is', 'unknown working')) working = 'untested';
  else if (hasWord(text, 'tested', 'getestet', 'working', 'funktioniert', 'funktionsfahig', 'works', 'fully working', 'functional', 'delujoc')) working = 'working';

  const reproduction = hasWord(text, 'repro', 'reproduction', 'reprodukcija', 'bootleg', 'custom', 'fan made', 'fanmade', 'replica', 'nachbau', 'nachdruck', 'pirate', 'fake', 'unofficial', 'homebrew', 'clone', 'klon', 'reproductie', 'reproduccion', 'repro label', 'repro box', 'repro cart');
  const lot = hasWord(t, 'lot', 'bundle', 'konvolut', 'sammlung', 'collection', 'spiele', 'games', 'sammlung', 'paket', 'job lot') || /(?:^|\s)(?:x\s?\d{2,}|\d{2,}\s?x|\d{2,}\s+(?:games|spiele|giochi|juegos))(?=\s|$)/.test(t);

  return { platform, region, kind, completeness, working, reproduction, lot, rest: t };
}
