import { Injectable, computed, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../api/api-base.js';
import { ForegroundRefreshService } from '../refresh/foreground-refresh.service.js';
import { TokenStore } from './token.store.js';
import { expiryFrom, msUntilRefresh, needsRefreshNow } from './token-lifetime.js';

interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
}

interface LogoutResponse {
  endSessionUrl: string;
}

/**
 * Izid obnove seje. Trije in ne dva namenoma: "seje ni več" in "strežnika ni bilo mogoče
 * doseči" imata NASPROTNI pravilni odziv — prvo je odjava, drugo je počakati in poskusiti
 * znova. Prej je bila obnova `boolean`, zato je bila vsaka spodletela obnova obravnavana
 * kot potekla seja in je prehodna napaka omrežja uporabnika odjavila.
 */
export type RefreshOutcome = 'ok' | 'session-invalid' | 'unreachable';

// 004: prijava ni več POST z geslom, ampak preusmeritev na Keycloaka (FR-002) — ta storitev
// zato nima več `login(email, password)`. Obnova seje je tudi edini način, da SPA sploh dobi
// dostopni žeton (ob zagonu, prek `ensureSession()` iz auth.guard.ts), ne samo tiha obnova
// ob 401 (research.md §1: web IN Android delita httpOnly piškotek).
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenStore = inject(TokenStore);
  private readonly foreground = inject(ForegroundRefreshService);

  readonly isAuthenticated = computed(() => this.tokenStore.accessToken() !== null);

  private refreshPromise: Promise<RefreshOutcome> | null = null;
  private stopProactive?: () => void;

  /** Preusmeri BRSKALNIK (ne XHR) na Keycloakovo prijavo (GET /auth/login). Klic se nikoli
   * ne vrne — stran se zapusti. */
  login(redirectTo = '/'): void {
    window.location.href = apiUrl(`/auth/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  /** Poskusi obnoviti sejo prek httpOnly piškotka — uporablja jo auth.guard.ts ob vsakem
   * zagonu/osvežitvi strani, preden odloči, ali je uporabnik prijavljen (dostopni žeton živi
   * samo v pomnilniku, glej token.store.ts). */
  async ensureSession(): Promise<boolean> {
    if (this.isAuthenticated()) return true;
    return this.silentRefresh();
  }

  /** Zožena oblika za klicatelje, ki jih zanima samo "je seja živa" (guard). */
  async silentRefresh(): Promise<boolean> {
    return (await this.refreshSession()) === 'ok';
  }

  /**
   * Obnovi sejo. Sočasni klicatelji delijo ISTO obnovo — to ni samo varčevanje s klici:
   * `/auth/refresh` ZAVRTI obnovitveni žeton (auth/router.ts, `rotateSessionRefreshToken`),
   * zato bi vzporedni klici z istim žetonom — kar se zgodi vsakič, ko zaslon naloži več
   * virov hkrati — pri Keycloaku sprožili zaznavo ponovne uporabe in podrli celo sejo.
   */
  async refreshSession(): Promise<RefreshOutcome> {
    this.refreshPromise ??= this.performRefresh().finally(() => {
      this.refreshPromise = null;
    });
    const outcome = await this.refreshPromise;
    // Urnik se zažene šele po prvi uspešni obnovi in izven `performRefresh` (sicer bi se
    // prvi tik zgodil sredi obnove, ki jo je pravkar sprožil).
    if (outcome === 'ok') this.startProactiveRefresh();
    return outcome;
  }

  private async performRefresh(): Promise<RefreshOutcome> {
    try {
      const res = await firstValueFrom(
        this.http.post<RefreshResponse>(apiUrl('/auth/refresh'), {}, { withCredentials: true }),
      );
      this.tokenStore.setAccessToken(res.accessToken, expiryFrom(res.expiresIn, new Date()));
      return 'ok';
    } catch (err) {
      const status = err instanceof HttpErrorResponse ? err.status : 0;
      // 401/403 z te poti pomeni, da seje ni več (piškotek manjka, seja preklicana, Keycloak
      // je obnovo zavrnil) — edini pravilni odziv je odjava. Vse drugo (0 = brez omrežja,
      // 5xx, časovna omejitev) NE pomeni, da seja ni veljavna: žeton se pusti pri miru in
      // klicatelj naj poskusi znova.
      if (status === 401 || status === 403) {
        this.tokenStore.clear();
        return 'session-invalid';
      }
      return 'unreachable';
    }
  }

  /**
   * Obnavljanje pred iztekom, samo dokler je zaslon v OSPREDJU (FR-022, člen XI): naprava v
   * žepu ne sme obnavljati seje v neskončnost. Ob vrnitvi v ospredje `ForegroundRefreshService`
   * takoj sproži tik, ki žeton obnovi, če je medtem potekel.
   */
  private startProactiveRefresh(): void {
    this.stopProactive ??= this.foreground.register(() => this.proactiveTick());
  }

  private async proactiveTick(): Promise<{ intervalMs: number }> {
    const now = new Date();
    if (needsRefreshNow(this.tokenStore.expiresAt(), now)) {
      await this.refreshSession();
    }
    return { intervalMs: msUntilRefresh(this.tokenStore.expiresAt(), new Date()) };
  }

  /** Prekliče lokalno sejo IN preusmeri brskalnik na Keycloakovo enotno odjavo (FR-004) —
   * brez tega bi naslednji obisk dobil tiho ponovno prijavo prek še vedno veljavne Keycloak
   * seje. Klic se (ob uspehu) nikoli ne vrne — stran se zapusti. */
  async logout(): Promise<void> {
    let endSessionUrl: string | null = null;
    try {
      const res = await firstValueFrom(
        this.http.post<LogoutResponse>(apiUrl('/auth/logout'), {}, { withCredentials: true }),
      );
      endSessionUrl = res.endSessionUrl;
    } finally {
      this.stopProactive?.();
      this.stopProactive = undefined;
      this.tokenStore.clear();
    }
    window.location.href = endSessionUrl ?? apiUrl('/auth/login');
  }
}
