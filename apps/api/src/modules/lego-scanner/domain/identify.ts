import { classifyListing, type Classified } from './classify.js';
import { normalizeName } from './set-number.js';
import type { CatalogSet, Identification, IdentificationConfidence } from './types.js';

// Identifikacija oglasa (018, FR-011, FR-012). Čista funkcija: vsa iskanja po katalogu opravi klicatelj
// vnaprej in jih poda kot podatek, zato je ta datoteka testirana brez omrežja.
//
// Prioriteta:
//   1. številka seta v naslovu            → katalog (visoko) | brez kataloga (srednje) | ni v katalogu (nizko, pregled)
//   2. normalizirano ime seta v naslovu   → en sam kandidat (srednje) | več (pregled)
//   3. tema + besede naslova              → en kandidat z velikim prekrivanjem (nizko, pregled)
//   4. (neobvezno, ločeno) AI             → nikoli edina podlaga; ni tu
//
// Samo `SET` z zaupanjem `high`/`medium` brez `needsReview` sme dobiti vrednost in oceno priložnosti
// (`canValue`). Paketi, deli, minifigure in prazne škatle imajo svojo vrsto in NIMAJO identitete seta.

/** Rezultat iskanja kataloga za eno številko: zapis, `null` = iskano in ne obstaja, `undefined` = ni iskano/ni vira. */
export type CatalogLookup = CatalogSet | null | undefined;

export interface IdentifyInput {
  title: string;
  description: string | null;
  /** Številka → rezultat iskanja. */
  catalogByNumber: ReadonlyMap<string, CatalogLookup>;
  /** Kandidati iskanja po imenu (prazno, kadar ni iskano ali ni zadetkov). */
  nameCandidates: readonly CatalogSet[];
  /** `true`, kadar je iskanje po imenu bilo opravljeno (sicer `undefined` pomeni "ni preverjeno"). */
  nameSearched: boolean;
}

function toCatalog(set: CatalogSet): NonNullable<Identification['catalog']> {
  return { setNumber: set.setNumber, name: set.name, theme: set.theme, subtheme: set.subtheme, year: set.year, pieces: set.pieces, imageUrl: set.imageUrl, url: set.url };
}

function notSet(kind: Exclude<Classified['kind'], 'CANDIDATE'>, reason: string): Identification {
  return { kind, confidence: 'none', reason, needsReview: false, catalog: null };
}

function tokenOverlap(title: string, setName: string): number {
  const a = new Set(normalizeName(title).split(' ').filter(Boolean));
  const b = normalizeName(setName).split(' ').filter(Boolean);
  if (b.length === 0) return 0;
  return b.filter((w) => a.has(w)).length / b.length;
}

export function identifyListing(input: IdentifyInput): Identification {
  const classified = classifyListing(input.title, input.description);
  if (classified.kind !== 'CANDIDATE') return notSet(classified.kind, classified.reason);

  const [number] = classified.numbers;
  if (number) {
    const looked = input.catalogByNumber.get(number);
    if (looked) {
      return { kind: 'SET', confidence: 'high', reason: `Številka ${number} je v katalogu: ${looked.name}.`, needsReview: false, catalog: toCatalog(looked) };
    }
    if (looked === null) {
      return {
        kind: 'UNIDENTIFIED',
        confidence: 'low',
        reason: `Številka ${number} ni v katalogu setov; morda ni številka seta.`,
        needsReview: true,
        catalog: null,
      };
    }
    return {
      kind: 'SET',
      confidence: 'medium',
      reason: `Številka ${number} je v naslovu, a ni potrjena v katalogu (katalog ni na voljo).`,
      needsReview: false,
      catalog: null,
    };
  }

  const normalizedTitle = normalizeName(input.title);
  const exact = input.nameCandidates.filter((c) => {
    const name = normalizeName(c.name);
    return name.length >= 6 && (normalizedTitle === name || normalizedTitle.includes(name));
  });
  const uniqueExact = [...new Map(exact.map((c) => [c.setNumber, c])).values()];
  if (uniqueExact.length === 1) {
    const set = uniqueExact[0]!;
    return { kind: 'SET', confidence: 'medium', reason: `Ime seta "${set.name}" ustreza naslovu (brez številke).`, needsReview: false, catalog: toCatalog(set) };
  }
  if (uniqueExact.length > 1) {
    return {
      kind: 'UNIDENTIFIED',
      confidence: 'low',
      reason: `Naslov ustreza več setom (${uniqueExact.slice(0, 3).map((c) => c.setNumber).join(', ')}); potreben je ročni pregled.`,
      needsReview: true,
      catalog: null,
    };
  }
  const fuzzy = input.nameCandidates.filter((c) => tokenOverlap(input.title, c.name) >= 0.75);
  if (fuzzy.length === 1) {
    const set = fuzzy[0]!;
    return { kind: 'SET', confidence: 'low', reason: `Naslov se približno ujema s setom "${set.name}"; potreben je ročni pregled.`, needsReview: true, catalog: toCatalog(set) };
  }
  return {
    kind: 'UNIDENTIFIED',
    confidence: 'none',
    reason: input.nameSearched ? 'Seta ni bilo mogoče zanesljivo prepoznati.' : 'Številke seta ni v naslovu in imena ni bilo mogoče preveriti.',
    needsReview: true,
    catalog: null,
  };
}

/** Samo zanesljivo prepoznan set sme dobiti vrednost in oceno priložnosti. */
export function canValue(id: Identification): boolean {
  return id.kind === 'SET' && (id.confidence === 'high' || id.confidence === 'medium') && !id.needsReview;
}

export type { IdentificationConfidence };
