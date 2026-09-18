import { z } from 'zod';

// Register ciljev uvoza. SKUPNA zmogljivost (platform/), ne modul — enako kot `platform/tabs/`
// in `platform/users/`.
//
// ZAKAJ REGISTER IN NE ENA DATOTEKA S STIKALOM. Vstopna točka za agenta mora pisati v recepte,
// povezave in beležke. Usmerjevalnik, ki bi te tri modele uvozil sam, bi bil natanko tista
// datoteka, ki jo člen I prepoveduje: brisanje modula `recipes` bi pokvarilo uvoz v beležke.
// Zato tu ni nobenega uvoza iz `modules/` in nobenega seznama ciljev — cilj prispeva MODUL SAM
// (`modules/<x>/ingest.ts`) z enim klicem `registerIngestTarget`, registriranim v `main.ts`
// poleg `registerTodosTabDetail()`. Odstranitev zavihka je še vedno brisanje ene mape in enega
// vnosa v registru: cilj preprosto izgine iz `GET /ingest/targets` in iz navodila.
//
// Isti vzorec kot `platform/tabs/extension.ts`, kjer modul 002 svojemu zavihku prispeva
// podnaslov, ne da bi register vedel, da modul 002 obstaja.

/** Vrsta polja, kot jo razume agent, ki sestavlja JSON. Namenoma DROBEN nabor: navodilo mora
 * biti berljivo jezikovnemu modelu, ne popoln opis sheme. Podrobnejše omejitve (dolžine, meje)
 * uveljavi `schema` cilja in se v navodilu pojavijo kot besedilo v `description`. */
export type IngestFieldType = 'string' | 'string[]' | 'number' | 'boolean';

export interface IngestField {
  name: string;
  type: IngestFieldType;
  required: boolean;
  /** Slovensko, ena poved. Gre DOBESEDNO v navodilo, ki ga uporabnik prilepi v ChatGPT —
   * zato je pisano agentu ("izpusti, če na strani ni"), ne razvijalcu. */
  description: string;
}

/** V čigavem imenu teče uvoz. Razrešeno PRED klicem cilja (`platform/ingest/router.ts`), da
 * vsak cilj dobi isti odgovor na isto vprašanje in ga ne rešuje po svoje. */
export interface IngestContext {
  /** Uporabnik, ki bo LASTNIK nastalega zapisa. Nikoli ni identifikator ključa. */
  userId: string;
  /** Ključ, s katerim je zahteva prišla — samo za dnevnik in za sled v odgovoru. */
  keyId: string;
}

/**
 * Izid enega uvoza.
 *
 * `duplicate` je REDNO stanje in ne napaka (enako kot `duplicateOfId` v modulu 008): agent isti
 * naslov pošlje dvakrat pogosteje, kot se zdi — ponovi klic po izteku časa, ali pa uporabnik
 * isto stran prilepi drugič. Napaka bi ga pri ponovitvi silila v ugibanje, zapis brez preverbe
 * pa bi knjižnico podvojil. Zato tretja možnost: zapisa ni bilo, obstoječi je naveden.
 */
export interface IngestOutcome {
  status: 'created' | 'duplicate';
  id: string;
  /** Kar naj agent pove nazaj človeku ("Shranil sem recept Bučna juha"). */
  title: string;
  /** Pot v vmesniku, BREZ izvora — naslov namestitve doda usmerjevalnik iz `PUBLIC_BASE_URL`,
   * ker je to nastavitev okolja in ne sme biti zapisana v modulu (isti razlog kot `publicLink`
   * pri receptih). */
  path: string;
  /** Kar je bilo porezano ali izpuščeno. Člen VII: izid ni skrit v dnevnik, ampak je polje v
   * odgovoru — agent mora imeti možnost povedati, da je od 300 sestavin shranil 100. */
  warnings?: string[];
}

export interface IngestTarget<TInput = unknown> {
  /** Vrednost polja `target` v telesu zahteve. Ista beseda kot koren poti modula
   * (`recipes`, `saved-links`, `notes`) — uporabnik jo prepozna, ne da bi jo iskal. */
  key: string;
  /** Prikazno ime za zaslon Nastavitve in za navodilo ("Recepti"). */
  title: string;
  /** Ena poved: kaj ta cilj naredi. Gre v navodilo. */
  summary: string;
  /**
   * Obseg, ki ga mora imeti ključ. NI `ingest:write`: uvoz v recepte je pisanje receptov in
   * mora zahtevati natanko tisto, kar zahteva `POST /recipes`.
   *
   * S tem vstopna točka za agenta NE more postati stranska vrata mimo obsegov — ključ, ki sme
   * uvažati beležke, ne more uvoziti recepta, tudi če v telo napiše `"target": "recipes"`.
   */
  scope: string;
  fields: IngestField[];
  /** Primer telesa, ki se v navodilu izpiše kot JSON. Mora prestati `schema` — to preverja
   * `tests/unit/ingest-registry.spec.ts`, sicer bi navodilo učilo agenta obliko, ki jo
   * strežnik zavrne. */
  example: Record<string, unknown>;
  schema: z.ZodType<TInput>;
  handle(input: TInput, ctx: IngestContext): Promise<IngestOutcome>;
}

// Modul se registrira ob zagonu (`main.ts`). `Map` in ne polje: ponovna registracija istega
// ključa mora vrednost ZAMENJATI in ne podvojiti — `createApp()` se v testih kliče večkrat v
// istem procesu, in dva vnosa za `recipes` bi pomenila dva cilja z istim imenom, od katerih bi
// eden pisal v bazo, ki je test medtem pobrisal.
const targets = new Map<string, IngestTarget<never>>();

export function registerIngestTarget<TInput>(target: IngestTarget<TInput>): void {
  targets.set(target.key, target as unknown as IngestTarget<never>);
}

/** Vsi cilji, po abecedi ključa — da sta seznam v Nastavitvah in besedilo navodila
 * DETERMINISTIČNA in se ne premešata ob spremembi vrstnega reda registracij v `main.ts`. */
export function listIngestTargets(): IngestTarget<never>[] {
  return [...targets.values()].sort((a, b) => a.key.localeCompare(b.key, 'sl'));
}

export function findIngestTarget(key: string): IngestTarget<never> | null {
  return targets.get(key) ?? null;
}

/** Ključi vseh registriranih ciljev — uporablja jih `platform/apikeys/router.ts` za preverbo,
 * da ključ ne dobi cilja, ki ne obstaja. */
export function ingestTargetKeys(): string[] {
  return listIngestTargets().map((t) => t.key);
}

/** Samo za teste: register je proces-globalen in bi brez tega en test videl cilje drugega. */
export function resetIngestTargetsForTests(): void {
  targets.clear();
}
