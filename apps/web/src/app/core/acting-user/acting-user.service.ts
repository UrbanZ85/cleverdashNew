import { Injectable, signal } from '@angular/core';

// 012 — administrator dela v imenu drugega uporabnika.
//
// Izbira je SHRANJENA v `localStorage` in ne samo v pomnilniku: preklop stran ponovno naloži
// (glej `select()`), poleg tega pa mora izbira preživeti osvežitev strani — sicer bi admin ob
// vsakem F5 tiho pisal spet v svoje podatke, česar na zaslonu ne bi opazil takoj.
//
// Shramba je NAMIG in ne resnica. Resnico pove `GET /auth/me` s poljem `actingAs`: vrednost
// tukaj lahko obvisi (izbrani uporabnik izbrisan, admin vloga odvzeta), zato jo
// `CurrentUserService` po vsakem nalaganju primerja z odgovorom strežnika in po potrebi
// počisti. Zato ta storitev shrambo bere samo enkrat, ob zagonu.

const STORAGE_KEY = 'cd.actingUserId';

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    // Zasebno okno ali onemogočena shramba: prevzem imena takrat ne preživi osvežitve, kar je
    // sprejemljivo — aplikacija mora delati naprej.
    return null;
  }
}

function writeStored(userId: string | null): void {
  try {
    if (userId) window.localStorage.setItem(STORAGE_KEY, userId);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* glej readStored() */
  }
}

@Injectable({ providedIn: 'root' })
export class ActingUserService {
  private readonly idSignal = signal<string | null>(readStored());

  /** Identifikator uporabnika, v čigavem imenu tečejo zahteve; `null` = v svojem. */
  readonly actingUserId = this.idSignal.asReadonly();

  /** Sinhroni odčitek za prestreznik (`auth.interceptor.ts`), ki teče izven reaktivnega
   * konteksta in mora vrednost dobiti takoj. */
  current(): string | null {
    return this.idSignal();
  }

  /**
   * Preklopi na drugega uporabnika (ali nazaj nase, z `null`) in PONOVNO NALOŽI stran.
   *
   * Ponovno nalaganje ni lenoba, ampak edina zanesljiva pot. Podatki uporabnika so razpršeni po
   * kakih dvajsetih storitvah s signali (`SettingsStore`, `PluginStore`, `TabRegistryService`,
   * `SavedLinksStore`, teme, stanja zavihkov …), vsaka s svojim predpomnilnikom in svojim
   * pojmom "naloženo enkrat na sejo". Ročno praznjenje vseh bi bilo seznam, ki ga je treba
   * dopolniti ob vsaki novi storitvi — pozabljena bi pomenila, da admin gleda ime enega
   * uporabnika in podatke drugega. To je najhujši izid, ki ga ta funkcionalnost lahko da, zato
   * se mu izognemo z ukrepom, ki ne more biti nepopoln.
   *
   * Prijava preživi: dostopni žeton res živi samo v pomnilniku, a `authGuard` ga ob zagonu
   * obnovi iz httpOnly sejnega piškotka (`ensureSession()`).
   */
  select(userId: string | null): void {
    const normalized = userId?.trim() || null;
    if (normalized === this.idSignal()) return;
    writeStored(normalized);
    this.idSignal.set(normalized);
    // Vedno na koren: zavihek izbranega uporabnika je lahko izklopljen (`tabGuard`), zato bi
    // ostanek na trenutni poti pomenil preusmeritev na zaslon z napako namesto na plošči.
    window.location.assign('/');
  }

  /**
   * Pozabi izbiro BREZ ponovnega nalaganja — samopopravek, ko strežnik sporoči, da prevzema
   * imena ni (`actingAs: null` pri `GET /auth/me`). Ponovno nalaganje bi tu naredilo zanko.
   */
  forget(): void {
    if (this.idSignal() === null) return;
    writeStored(null);
    this.idSignal.set(null);
  }
}
