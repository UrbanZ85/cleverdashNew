import type { StorageSourceDef } from './storage-sources.js';

// Čisto zlaganje surovih vsot v to, kar vidi administrator (člen IX: brez baze, brez strežnika).
//
// Dve nasprotni napaki, ki ju je pri agregaciji lahko narediti in ju ta datoteka preprečuje
// (research.md §9):
//
//  1. IZPUSTITI vrstice brez ujemajočega uporabnika — vsota po osebah bi bila manjša od skupne
//     in razlike ne bi bilo mogoče pojasniti.
//  2. IZPUSTITI osebe brez vsebine — "kdo ničesar ne hrani" je enako veljavno vprašanje kot
//     "kdo hrani največ", in prazna vrstica je odgovor nanj.

/** Ena vrstica, kakršno vrne agregacija nad eno zbirko. */
export interface SourceRow {
  sourceId: string;
  /** `null`, kadar zapis lastnika nima ali ga ni mogoče razrešiti. */
  ownerId: string | null;
  bytes: number;
  count: number;
}

export interface DirectoryUser {
  id: string;
  displayName: string;
  maskedEmail: string | null;
}

export interface StorageSourceSummary {
  id: string;
  label: string;
  present: boolean;
  totalBytes: number;
  recordCount: number;
}

export interface StorageUserRow {
  userId: string | null;
  displayName: string;
  maskedEmail: string | null;
  totalBytes: number;
  perSource: Record<string, number>;
  counts: Record<string, number>;
}

export interface StorageRollup {
  totalBytes: number;
  sources: StorageSourceSummary[];
  byUser: StorageUserRow[];
}

/** Ime vrstice za bajte, katerih lastnika ni mogoče imenovati (FR-013). */
export const UNKNOWN_OWNER_LABEL = 'Neznan lastnik';

function emptyMap(sources: Array<{ id: string }>): Record<string, number> {
  return Object.fromEntries(sources.map((s) => [s.id, 0]));
}

export function rollupStorage(params: {
  sources: Array<StorageSourceDef & { present: boolean }>;
  rows: readonly SourceRow[];
  users: readonly DirectoryUser[];
}): StorageRollup {
  const { sources, rows, users } = params;

  const summaries: StorageSourceSummary[] = sources.map((source) => ({
    id: source.id,
    label: source.label,
    present: source.present,
    totalBytes: 0,
    recordCount: 0,
  }));
  const summaryById = new Map(summaries.map((s) => [s.id, s]));

  // VSAKA oseba z računom dobi vrstico, tudi prazno (FR-008). Vrstice se ustvarijo PRED branjem
  // podatkov, ne iz njih — sicer bi jih imele samo osebe, ki nekaj hranijo.
  const byUser = new Map<string, StorageUserRow>(
    users.map((user) => [
      user.id,
      {
        userId: user.id,
        displayName: user.displayName,
        maskedEmail: user.maskedEmail,
        totalBytes: 0,
        perSource: emptyMap(sources),
        counts: emptyMap(sources),
      },
    ]),
  );

  // Vrstica za neznanega lastnika nastane IZKLJUČNO, če se kakšen zapis vanjo zares uvrsti. Prazna
  // bi bila videti kot ugotovitev o napaki, ki je ni.
  let unknown: StorageUserRow | null = null;
  const unknownRow = (): StorageUserRow => {
    unknown ??= {
      userId: null,
      displayName: UNKNOWN_OWNER_LABEL,
      maskedEmail: null,
      totalBytes: 0,
      perSource: emptyMap(sources),
      counts: emptyMap(sources),
    };
    return unknown;
  };

  let totalBytes = 0;

  for (const row of rows) {
    const summary = summaryById.get(row.sourceId);
    // Vrstica vira, ki ga tabela ne pozna, se ne sme tiho zliti v skupno vsoto: ne bi je bilo
    // mogoče pojasniti v nobenem stolpcu.
    if (!summary) continue;

    summary.totalBytes += row.bytes;
    summary.recordCount += row.count;
    totalBytes += row.bytes;

    const target = (row.ownerId !== null ? byUser.get(row.ownerId) : undefined) ?? unknownRow();
    target.totalBytes += row.bytes;
    target.perSource[row.sourceId] = (target.perSource[row.sourceId] ?? 0) + row.bytes;
    target.counts[row.sourceId] = (target.counts[row.sourceId] ?? 0) + row.count;
  }

  const rowsOut = [...byUser.values()].sort((a, b) => b.totalBytes - a.totalBytes || a.displayName.localeCompare(b.displayName, 'sl'));
  if (unknown) rowsOut.push(unknown);

  return { totalBytes, sources: summaries, byUser: rowsOut };
}
