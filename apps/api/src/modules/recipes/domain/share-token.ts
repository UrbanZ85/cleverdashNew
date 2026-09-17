import { randomBytes } from 'node:crypto';

// FR-040, research.md §7: žeton v javni povezavi do recepta.
//
// 16 naključnih bajtov (128 bitov) v `base64url` = 22 znakov. NI izpeljan iz identifikatorja
// zapisa, imena recepta, lastnika ne zaporedne številke — iz ene povezave ni mogoče izpeljati
// druge.
//
// Zakaj ne Mongo `_id`: `ObjectId` nosi časovni žig in števec, zato se dva zaporedno nastala
// zapisa razlikujeta v nekaj bitih. Povezava mora biti neuganljiva tudi za nekoga, ki že ima eno
// svojo.
//
// Prepisano iz `modules/file-sharing/domain/share-token.ts`, ne uvoženo (člen I). Gesla tu NI,
// za razliko od 009: tam gre za datoteko, ki je lahko karkoli, tu za recept, ki je bil poslan
// zato, da se prebere. Geslo bi bilo drugi kanal za nekaj, kar ga ne potrebuje.

const TOKEN_BYTES = 16;
export const RECIPE_SHARE_TOKEN_LENGTH = 22;

export function generateRecipeShareToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * Ali je vrednost SPLOH videti kot žeton — preverba se opravi PRED poizvedbo, ne za njo.
 *
 * Nastalo iz najdbe varnostnega pregleda 009 (glej `isGrantShaped` v
 * `modules/file-sharing/domain/share-token.ts`): `cookie-parser` na vsak piškotek uporabi
 * `JSONCookies`, zato vrednost, ki se začne z `j:`, v `req.cookies` NI niz, ampak razčlenjen
 * objekt — ki je v Mongoose pogoju OPERATOR. Tam je to pomenilo, da je `{"$ne":null}` ujel
 * katero koli živo dovolilnico.
 *
 * Tu žeton pride iz POTI in ne iz piškotka, zato je Express vrednost vedno niz in ta napaka ni
 * dosegljiva. Preverba je vseeno tu in vseeno prva: vzorec mora biti enoten, sicer ga naslednji
 * modul, ki bo žeton bral od drugod, prepiše narobe.
 *
 * Globalni `mongoose.set('sanitizeFilter', true)` bi bil videti kot krajša pot, a bi zahteval
 * `mongoose.trusted()` pri vsakem legitimnem `$gt`/`$ne`/`$in` v vsem zaledju — torej desetine
 * mest, kjer je pozabljen ovoj tiha okvara poizvedbe.
 */
export function isRecipeShareTokenShaped(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    new RegExp(`^[A-Za-z0-9_-]{${RECIPE_SHARE_TOKEN_LENGTH}}$`).test(value)
  );
}

/**
 * Javna povezava, kakršno lastnik pošlje prejemniku.
 *
 * Sestavlja se ob branju iz `PUBLIC_BASE_URL` in se NE shranjuje: naslov namestitve je nastavitev
 * okolja in bi se ob selitvi domene tiho pokvaril v vsakem starem zapisu.
 *
 * Pot je `/r/` — tretja javna pot v tej aplikaciji, ob `/d/` (prevzem datoteke) in `/u/` (oddaja
 * datoteke). Kratka namenoma: povezava gre v tuje pogovore, kjer se dolg naslov lomi. Različna od
 * obeh obstoječih prav tako namenoma — nihče, ki bere naslov v dnevniku ali v pogovoru, ne sme
 * biti v dvomu, za kaj gre (research.md §8).
 */
export function buildRecipeShareUrl(publicBaseUrl: string, token: string): string {
  return `${publicBaseUrl.replace(/\/+$/, '')}/r/${token}`;
}
