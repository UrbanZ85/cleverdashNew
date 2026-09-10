import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../api/api-base.js';
import { ActingUserService } from '../acting-user/acting-user.service.js';

/** Uporabnik, katerega ime je prevzeto (012). Ista projekcija kot imenik `GET /users` —
 * e-pošta je ZAMASKIRANA (`a…k@agenda.si`), ker prevzem imena pravice do celega naslova ne
 * prinese. */
export interface ActingAsUser {
  id: string;
  displayName: string;
  initials: string;
  emailHint: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  scopes: string[];
  lastLoginAt: string | null;
  /** `null` = klicatelj dela v svojem imenu. */
  actingAs: ActingAsUser | null;
}

// `GET /auth/me` obstaja od 004, a ga do zdaj ni klical nihče — aplikacija nikjer ni
// pokazala, KDO je prijavljen, in ni imela gumba za odjavo. Meni oboje potrebuje.
@Injectable({ providedIn: 'root' })
export class CurrentUserService {
  private readonly http = inject(HttpClient);
  private readonly actingUser = inject(ActingUserService);
  private readonly userSignal = signal<CurrentUser | null>(null);
  private inFlight: Promise<void> | null = null;

  readonly user = this.userSignal.asReadonly();

  /** 012: sme prevzeti ime drugega uporabnika. Obseg `admin` pomeni "vsi obsegi" in ga ima
   * izključno človek z Keycloakovo admin vlogo (platform/auth/scopes.ts). */
  readonly canActAsOthers = computed(() => this.userSignal()?.scopes.includes('admin') === true);

  /** Uporabnik, katerega ime je trenutno prevzeto — po STREŽNIKU, ne po shrambi brskalnika. */
  readonly actingAs = computed(() => this.userSignal()?.actingAs ?? null);

  /** Naloži enkrat na sejo; sočasni klicatelji (meni in spodnja vrstica zavihkov se
   * inicializirata skupaj) si delijo isto zahtevo. */
  async ensureLoaded(): Promise<void> {
    if (this.userSignal()) return;
    this.inFlight ??= this.load().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async load(): Promise<void> {
    try {
      const user = await firstValueFrom(
        this.http.get<CurrentUser>(apiUrl('/auth/me'), { withCredentials: true }),
      );
      this.userSignal.set(user);

      // 012, samopopravek: shranjena izbira v brskalniku je samo namig. Če strežnik pravi, da
      // prevzema imena ni — izbrani uporabnik je bil izbrisan, admin vloga odvzeta — jo je
      // treba pozabiti TAKOJ. Brez tega bi vsaka nadaljnja zahteva nosila glavo, ki jo
      // strežnik zavrne s 403/404, in aplikacija bi ostala mrtva do ročnega brisanja shrambe.
      // `/auth/me` je edina pot, ki na tako glavo namenoma NE vrne napake (glej
      // platform/auth/acting-user.ts, `NO_EFFECT_PREFIXES`) — zato je popravek mogoč prav tu.
      if (!user.actingAs) this.actingUser.forget();
    } catch {
      // Meni deluje tudi brez imena uporabnika — prijava sama je že preverjena z
      // `authGuard`, zato tu ni razloga za napako na zaslonu.
    }
  }

  clear(): void {
    this.userSignal.set(null);
  }

  /** Začetnici za znak v meniju; prazno ime da vprašaj, ne prazen krog. */
  initials(): string {
    const name = this.userSignal()?.displayName?.trim();
    if (!name) return '?';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  }
}
