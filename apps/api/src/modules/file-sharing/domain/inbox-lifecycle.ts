import { isExpired } from './share-lifecycle.js';

// Stanja in rok SPREJEMNEGA PREDALA (009b, FR-085/FR-087/FR-094).
//
// Predal je obrnjena povezava: pri deljenju lastnik POŠLJE datoteko naslovniku brez računa, pri
// predalu jo naslovnik brez računa PRINESE lastniku. Naslov in koda sta zato ista dva ključa kot
// pri deljenju — samo smer podatkov je druga.
//
// Zakaj svoj nabor stanj in ne `SHARE_STATES`: pri datoteki je `broken` ugotovitev o razhajanju
// med zapisom in vsebino na disku, predal pa vsebine NIMA — zanj tako stanje ne obstaja in ga
// ne sme biti mogoče niti izraziti. Podedovan nabor s stanjem, ki v tej entiteti nič ne pomeni,
// je vabilo za vejo, ki nikoli ne teče.
//
// "POTEKLO" tudi tu NI shranjeno stanje (enako kot v share-lifecycle.ts): izpelje se iz
// `expiresAt < zdaj`. Shranjeno stanje bi se moralo vzdrževati z opravilom in bi se med
// trenutkom poteka in trenutkom zapisa razhajalo s časom — predal bi po roku še sprejemal.
//
// Člen IX: čiste funkcije, brez baze, omrežja in ure (`now` je vedno argument).

export const INBOX_STATES = ['open', 'closed'] as const;
export type InboxState = (typeof INBOX_STATES)[number];

/**
 * Dovoljeni NEPOSREDNI prehodi.
 *
 * `closed → open` NI med njimi, po istem razlogu kot `revoked → ready` pri datoteki: zaprtje se
 * ne "odklene". Edina pot nazaj v obtok je izdaja NOVE kode, kar je druga operacija z drugimi
 * posledicami (nov naslov, razveljavljene dovolilnice) — glej `canReissueCode`.
 */
export function canTransition(from: InboxState, to: InboxState): boolean {
  return from === 'open' && to === 'closed';
}

/** Novo kodo je mogoče izdati za vsak predal, ki obstaja — tudi za zaprtega in poteklega, saj ga
 * prav to vrne v obtok (FR-083). */
export function canReissueCode(_state: InboxState): boolean {
  return true;
}

/**
 * Ali predal sme sprejeti oddajo: pravo stanje IN rok, ki še ni minil.
 *
 * Prostor (število datotek, skupni bajti) TU ni upoštevan namenoma — to je druga vrsta meje,
 * ki jo pozna `inbox-capacity.ts` in ki se s časom in stanjem ne meša.
 */
export function isOpenForUpload(inbox: { state: InboxState; expiresAt: Date | null }, now: Date): boolean {
  return inbox.state === 'open' && !isExpired(inbox.expiresAt, now);
}
