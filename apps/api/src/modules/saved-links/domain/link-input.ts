import { z } from 'zod';
import { MAX_LINK_URL_LENGTH } from './link-url.js';
import { escapeRegExp, foldForSearch } from './search-text.js';

// Čista domenska plast modula, po vzoru `modules/notes/domain/note-input.ts` (research.md
// §15): brez uvozov iz express/mongoose, zato testabilna brez baze in brez strežnika
// (člen IX). Router jo samo kliče.
//
// Imena so prevzeta poimensko, da je koda berljiva vštric z beležkami: `buildNotesFilter` →
// `buildLinksFilter`, `deriveTitle` → `deriveLinkTitle`, `notesQuerySchema` →
// `linksQuerySchema`.

export const MAX_TITLE_LENGTH = 200;
export const MAX_COMMENT_LENGTH = 1000;
export const MAX_GROUP_NAME_LENGTH = 60;
export const MAX_QUERY_LENGTH = 200;

/** Vrednost, ki v parametru `groupId` pomeni "nerazvrščeni" (`groupId: null`). Beseda in ne
 * prazen niz: prazen parameter v naslovu se ne loči od izpuščenega, `groupId=` pa bi bilo
 * videti kot "vse mape" — natanko obratno od tega, kar bi klicatelj hotel. */
export const UNGROUPED = 'none';

/**
 * Telo za `POST /saved-links`. `url` je edino obvezno polje (pogodba, `SavedLinkInput`) —
 * shranjevanje strani ne sme terjati vpisovanja imena (SC-001).
 *
 * Dolžine so tu in ne le v shemi baze, ker mora predolg vnos vrniti `400` z imenom polja, ne
 * `500` iz Mongoose validacije.
 */
export const linkWriteSchema = z.object({
  url: z.string().min(1).max(MAX_LINK_URL_LENGTH),
  title: z.string().max(MAX_TITLE_LENGTH).optional(),
  comment: z.string().max(MAX_COMMENT_LENGTH).nullish(),
  icon: z.string().max(60).nullish(),
  groupId: z.string().nullish(),
});

export type LinkWriteInput = z.infer<typeof linkWriteSchema>;

/** Telo za `PATCH /saved-links/{linkId}`: vsa polja neobvezna, izpuščena ostanejo (pogodba,
 * `SavedLinkPatch`). `url` je tu neobvezen — to je edina razlika do sheme zgoraj, in zato
 * ločena shema namesto `.partial()`, ki bi obvezni `url` tiho izgubila tudi pri POST. */
export const linkPatchSchema = z.object({
  url: z.string().min(1).max(MAX_LINK_URL_LENGTH).optional(),
  title: z.string().max(MAX_TITLE_LENGTH).optional(),
  comment: z.string().max(MAX_COMMENT_LENGTH).nullish(),
  icon: z.string().max(60).nullish(),
  groupId: z.string().nullish(),
});

export type LinkPatchInput = z.infer<typeof linkPatchSchema>;

/** Parametri `GET /saved-links`. Brez `limit` ni omejitve — odjemalec seznam naloži enkrat in
 * po njem išče v pomnilniku (SC-003), zato mu privzeta stran ne bi koristila, ploščica na
 * nadzorni plošči pa `limit` pošlje izrecno. */
export const linksQuerySchema = z.object({
  q: z.string().trim().max(MAX_QUERY_LENGTH).optional(),
  groupId: z.string().trim().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  sort: z.enum(['manual', 'recent']).default('manual'),
});

export type LinksQuery = z.infer<typeof linksQuerySchema>;

/** Telo za obe poti vrstnega reda (`PUT /saved-links/order`, `PUT /saved-link-groups/order`)
 * — ena operacija s celotnim seznamom, ne zaporedje posamičnih popravkov (FR-032). */
export const linkOrderSchema = z.object({
  groupId: z.string().nullish(),
  linkIds: z.array(z.string()).max(1000),
});

export const groupOrderSchema = z.object({
  groupIds: z.array(z.string()).max(200),
});

export const groupCreateSchema = z.object({
  name: z.string().trim().min(1).max(MAX_GROUP_NAME_LENGTH),
});

export const groupPatchSchema = z.object({
  name: z.string().trim().min(1).max(MAX_GROUP_NAME_LENGTH).optional(),
  collapsed: z.boolean().optional(),
});

export const refreshMetadataSchema = z.object({
  force: z.boolean().default(false),
});

/**
 * Mongo filter za seznam zapisov. `userId` je VEDNO del filtra — zapisi so osebni
 * (data-model.md, vzorec 004), zato ta funkcija brez njega niti ne more sestaviti poizvedbe.
 *
 * Iskanje teče nad zloženim `searchText` in ne nad posameznimi polji: samo tako `cas` najde
 * "časa" (research.md §6). Poizvedba se zloži z istim pravilom kot shranjeno polje, sicer se
 * `Č` iz vnosa ne bi ujel z `c` v zapisu.
 */
export function buildLinksFilter(params: {
  userId: string;
  query?: string;
  groupId?: string | null;
}): Record<string, unknown> {
  const filter: Record<string, unknown> = { userId: params.userId };

  if (params.query) {
    const folded = foldForSearch(params.query.trim());
    if (folded.length > 0) {
      filter.searchText = { $regex: escapeRegExp(folded) };
    }
  }

  // `undefined` pomeni "vse mape" (FR-031: iskanje gre čez vse hkrati), `null` pomeni
  // "nerazvrščeni". Razlike ni mogoče izraziti z eno vrednostjo, zato je preverba izrecna.
  if (params.groupId !== undefined) {
    filter.groupId = params.groupId;
  }

  return filter;
}

/** Prevede parameter `groupId` iz naslova v vrednost za filter: izpuščen → `undefined` (vse),
 * `none` → `null` (nerazvrščeni), sicer ID mape. */
export function parseGroupIdParam(raw: string | undefined): string | null | undefined {
  if (raw === undefined || raw === '') return undefined;
  return raw === UNGROUPED ? null : raw;
}

/**
 * Ime zapisa, ki ga uporabnik ni vpisal in ga ni bilo mogoče prebrati s strani: gostitelj
 * naslova (data-model.md — `title` ni nikoli prazen). Izpelje se ob PISANJU in ne ob izpisu,
 * da je enak v seznamu, v iskanju in na ploščici.
 *
 * Ustreznik `deriveTitle` iz beležk; razlika je samo v nadomestku (gostitelj namesto prve
 * vrstice vsebine).
 */
export function deriveLinkTitle(title: string | undefined | null, url: string): string {
  const trimmed = (title ?? '').trim();
  if (trimmed.length > 0) return trimmed.slice(0, MAX_TITLE_LENGTH);
  try {
    return new URL(url).hostname.replace(/^www\./, '').slice(0, MAX_TITLE_LENGTH);
  } catch {
    // Do sem naslov pride že normaliziran; če vseeno ni URL, je gol naslov boljši od praznega
    // imena — zapis mora biti v seznamu prepoznaven.
    return url.slice(0, MAX_TITLE_LENGTH);
  }
}
