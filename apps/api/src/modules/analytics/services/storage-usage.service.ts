import mongoose from 'mongoose';
import { maskEmail } from '../../../platform/users/user-directory.js';
import {
  markPresence,
  STORAGE_SOURCES,
  USERS_COLLECTION,
  type StorageSourceDef,
} from '../domain/storage-sources.js';
import type { SourceRow } from '../domain/storage-rollup.js';
import type { UserWithLastLogin } from '../domain/usage-rollup.js';

// Poizvedbeni del pregleda porabe. EDINO mesto v tem modulu, ki se dotakne baze tujih modulov —
// in to izključno po IMENU ZBIRKE prek surove povezave (research.md §2).
//
// `import { RecipeImageModel }` bi bil kršitev člena I (uveljavlja `cleverdash/module-boundary`) in
// bi hkrati pomenil, da brisanje modula 013 podre analitiko. Cena tega pristopa je, da imen
// prevajalnik ne varuje; varovalo je `tests/unit/analytics-sources.spec.ts`.
//
// Vse je AGREGACIJA in nič branja v Node: pri 50 000 zapisih bi `find().lean()` prenesel celotno
// zbirko v pomnilnik procesa, `$group` pa vrne po eno vrstico na lastnika.

function db() {
  const connection = mongoose.connection.db;
  if (!connection) throw new Error('Povezava z bazo ni vzpostavljena.');
  return connection;
}

/** Katere zbirke v tej namestitvi sploh obstajajo. Ena poizvedba za vse vire. */
export async function listExistingCollections(): Promise<string[]> {
  const infos = await db().listCollections({}, { nameOnly: true }).toArray();
  return infos.map((info) => info.name);
}

interface GroupRow {
  _id: unknown;
  bytes: number | null;
  count: number;
}

async function aggregateSource(source: StorageSourceDef): Promise<SourceRow[]> {
  const rows = await db()
    .collection(source.collection)
    .aggregate<GroupRow>([
      ...(source.match ? [{ $match: source.match }] : []),
      {
        $group: {
          _id: `$${source.ownerField}`,
          // Vir brez izraza se samo šteje (besedilni zapisi, research.md §13).
          bytes: { $sum: source.sizeExpression ?? 0 },
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();

  return rows.map((row) => ({
    sourceId: source.id,
    // `_id` je `ObjectId`, kadar lastnik obstaja, in `null`, kadar polja ni. Pretvorba v niz je
    // tu in ne v domeni: domena ne sme vedeti, kakšne oblike so identifikatorji v bazi.
    ownerId: row._id === null || row._id === undefined ? null : String(row._id),
    bytes: row.bytes ?? 0,
    count: row.count,
  }));
}

/**
 * Surove vsote po vseh MERLJIVIH virih.
 *
 * Vir, katerega zbirke ni, se preskoči brez napake (FR-012) — modul se odstrani z brisanjem ene
 * mape in enega vnosa v registru (člen I), in analitika zaradi tega ne sme pasti.
 */
export async function readSourceRows(
  sources: Array<StorageSourceDef & { present: boolean }>,
): Promise<SourceRow[]> {
  const present = sources.filter((s) => s.present);
  const results = await Promise.all(present.map((source) => aggregateSource(source)));
  return results.flat();
}

/** Tabela virov z oznako, ali so v tej namestitvi merljivi. */
export async function resolveSources(): Promise<Array<StorageSourceDef & { present: boolean }>> {
  return markPresence(STORAGE_SOURCES, await listExistingCollections());
}

/**
 * Vsi računi — tudi tisti brez vsebine in tisti, ki se še niso prijavili (FR-008).
 *
 * Projekcija je eksplicitna in kratka: `scopes` in `keycloakSubject` sta varnostna podatka in v
 * odgovoru nimata česa iskati, tudi kadar ga bere administrator.
 *
 * E-pošta gre skozi `maskEmail` (FR-009). Da je bralec administrator, ni razlog za izjemo: cel
 * naslov bi isto potrebo — razločiti soimenjaka — pokril enako dobro in povrhu izročil seznam
 * naslovov cele namestitve enemu zaslonu, ki ga nihče ne varuje posebej.
 *
 * `lastLoginAt` je zraven, ker ga potrebuje pregled uporabe: obstaja od 004 in je EDINI podatek o
 * prijavah za čas PRED uvedbo te funkcionalnosti. Pregled porabe ga ne bere in mu ne škodi.
 */
export async function readAllUsers(): Promise<UserWithLastLogin[]> {
  const rows = await db()
    .collection(USERS_COLLECTION)
    .find({}, { projection: { _id: 1, displayName: 1, email: 1, lastLoginAt: 1 } })
    .toArray();

  return rows.map((row) => ({
    id: String(row._id),
    displayName: typeof row.displayName === 'string' ? row.displayName : 'Neznano ime',
    maskedEmail: typeof row.email === 'string' ? maskEmail(row.email) : null,
    lastLoginAt: row.lastLoginAt instanceof Date ? row.lastLoginAt : null,
  }));
}
