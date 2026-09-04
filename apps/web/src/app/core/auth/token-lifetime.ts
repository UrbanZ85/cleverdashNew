// Čista logika o življenjski dobi dostopnega žetona — brez uvozov iz @angular/*, da je
// preverljiva brez TestBed-a (isti razlog kot pri core/settings/settings.model.ts).
//
// ZAKAJ TO OBSTAJA. `POST /auth/refresh` je od 004 vračal `expiresIn`, odjemalec pa ga je
// zavrgel: shranil je samo žeton. Posledica je bila, da se je seja obnavljala izključno
// REAKTIVNO — šele potem, ko je zahteva že padla s 401. Keycloakov dostopni žeton živi
// privzeto 5 minut, zato je vsakih 5 minut prva serija zahtev (na nadzorni plošči več
// ploščic hkrati) padla s 401, preden je prestreznik sejo obnovil in zahteve ponovil.
//
// Za uporabnika je bilo videti tako, kot je videti: aplikacija je delovala, hkrati pa je
// javljala, da seja ni aktivna — in v dnevniku strežnika je bil ob vsakem izteku šop
// opozoril "Neveljaven ali potekel dostopni žeton".
//
// Rešitev je obnova PRED iztekom (in vnaprejšnja obnova v prestrezniku, kadar je žeton že
// potekel, ker je bila naprava med tem v ozadju ali v spanju). Reaktivna pot ob 401 ostaja
// kot varovalka — nikoli ne škodi, samo ne sme biti edina.

/** Koliko pred iztekom se žeton obnovi. Ena minuta je dovolj za počasno omrežje in za
 * zahteve, ki so že na poti, hkrati pa ne zavrže večine življenjske dobe žetona. */
export const REFRESH_SKEW_MS = 60_000;

/** Spodnja meja med dvema obnovama. Varovalka pred tesno zanko, če bi vir kdaj vrnil
 * nesmiselno kratko življenjsko dobo (npr. `expiresIn: 10`). */
export const MIN_REFRESH_DELAY_MS = 5_000;

/** Zgornja meja čakanja. Ura naprave se lahko premakne, naprava lahko spi — po tem času se
 * stanje vsaj pogleda, tudi če je žeton na videz še dolgo veljaven. */
export const MAX_REFRESH_DELAY_MS = 15 * 60_000;

/** Trenutek izteka (epoch ms) iz `expiresIn` v sekundah, kot ga vrne `POST /auth/refresh`. */
export function expiryFrom(expiresInSeconds: number, now: Date): number {
  const seconds = Number.isFinite(expiresInSeconds) ? Math.max(0, expiresInSeconds) : 0;
  return now.getTime() + seconds * 1000;
}

/**
 * `true`, kadar je žeton potekel ali poteče v naslednji minuti — takrat ga je treba obnoviti
 * PRED pošiljanjem zahteve.
 *
 * Neznan iztek (`null`) vrne `false`: ne ugibamo. Tak žeton je lahko samo tisti, ki ga ta
 * odjemalec ni dobil prek `/auth/refresh`, in zanj ostane reaktivna pot ob 401.
 */
export function needsRefreshNow(expiresAt: number | null, now: Date): boolean {
  if (expiresAt === null) return false;
  return expiresAt - now.getTime() <= REFRESH_SKEW_MS;
}

/**
 * Čez koliko časa naj se sproži naslednja vnaprejšnja obnova. Vedno znotraj
 * [`MIN_REFRESH_DELAY_MS`, `MAX_REFRESH_DELAY_MS`] — nikoli 0 (tesna zanka) in nikoli
 * neomejeno dolgo.
 */
export function msUntilRefresh(expiresAt: number | null, now: Date): number {
  if (expiresAt === null) return MAX_REFRESH_DELAY_MS;
  const untilRefresh = expiresAt - now.getTime() - REFRESH_SKEW_MS;
  return Math.min(Math.max(untilRefresh, MIN_REFRESH_DELAY_MS), MAX_REFRESH_DELAY_MS);
}
