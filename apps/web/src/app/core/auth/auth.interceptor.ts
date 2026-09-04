import { inject } from '@angular/core';
import type { HttpInterceptorFn } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { TokenStore } from './token.store.js';
import { AuthService } from './auth.service.js';
import { needsRefreshNow } from './token-lifetime.js';

// Pot za obnovo žetona se izogne temu interceptorju — brez tega bi neuspela obnova sprožila
// samo sebe v neskončno zanko. Ista izjema, ki jo pozna backend (Idempotency-Key, člen III),
// se tu ponovi na strani odjemalca. `/auth/login` ostane v seznamu iz previdnosti, čeprav se
// po 004 nikoli več ne kliče prek HttpClient — je preusmeritev brskalnika (auth.service.ts),
// ne XHR (research.md §1).
// 009: `/api/v1/share/*` so JAVNE poti — kliče jih stran `/d/:token`, do katere pride človek
// BREZ računa (research.md §2). Dvoje sledi iz tega, in oboje je razlog za to izjemo:
//
//  1. Glava `Authorization` tam nima kaj iskati; strežnik `req.auth` na teh poteh sploh ne bere.
//  2. Če ima brskalnik POTEKEL žeton, ga vratar zavrne s 401, še preden zahteva doseže
//     usmerjevalnik — javna stran bi se podrla zaradi seje, s katero nima nobene zveze.
//
// Izjema je tudi za `catchError` spodaj: 401 z javne poti pomeni "manjka dovolilnica" in ne
// "seja je potekla", zato ne sme sprožiti tihe obnove žetona ne odjave.
const AUTH_EXEMPT = ['/auth/login', '/auth/refresh', '/api/v1/share/'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // OBE odvisnosti se morata vzeti TUKAJ, v telesu interceptorja. Angular postavi
  // vbrizgovalni kontekst samo za sinhroni klic te funkcije (`runInInjectionContext` v
  // `chainedInterceptorFn`); povratni klici rxjs-a (`catchError` spodaj) stečejo šele ob
  // napaki, ko konteksta ni več, in `inject()` tam vrže NG0203. Posledica tiste napake ni
  // bila vidna: tiha obnova se sploh ni zgodila, 401 je šel naprej kot navadna napaka,
  // zasloni pa jo požrejo v prazen `catch {}` — aplikacija je izgledala prijavljena, vsak
  // klic na API pa je vračal 401.
  const tokenStore = inject(TokenStore);
  const authService = inject(AuthService);
  const isExempt = AUTH_EXEMPT.some((p) => req.url.includes(p));

  const send = () => {
    // Žeton se prebere ZNOTRAJ te funkcije, ne enkrat zgoraj: med vnaprejšnjo obnovo in
    // ponovnim poskusom se je vrednost spremenila, in poslati je treba novo.
    const token = tokenStore.accessToken();
    const withAuth = !isExempt && token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
    return next(withAuth);
  };

  /** Reaktivna varovalka: 401 kljub svežemu žetonu (odvzeta vloga, preklicana seja, ura
   * naprave zamaknjena). Ponovni poskus je NAJVEČ eden — `send()` znotraj `catchError` te
   * obravnave ne dobi znova, zato zanka ni mogoča. */
  const sendWithRecovery = () =>
    send().pipe(
      catchError((err: unknown) => {
        if (isExempt || !(err instanceof HttpErrorResponse) || err.status !== 401) {
          return throwError(() => err);
        }
        return from(authService.refreshSession()).pipe(
          switchMap((outcome) => {
            // Odjava SAMO takrat, kadar je strežnik povedal, da seje ni več. Nedosegljiv
            // strežnik ni potekla seja: prej je vsaka prehodna napaka omrežja med obnovo
            // uporabnika vrgla na Keycloakovo prijavo.
            if (outcome === 'session-invalid') {
              void authService.logout();
              return throwError(() => err);
            }
            if (outcome === 'unreachable') return throwError(() => err);
            return send();
          }),
        );
      }),
    );

  // Vnaprejšnja obnova: žeton je potekel ali poteče v naslednji minuti (naprava je bila v
  // ozadju, v spanju, ali pa je urnik zamudil tik). Brez tega je vsakih pet minut prva
  // serija zahtev — na nadzorni plošči več ploščic hkrati — padla s 401, in strežnik je za
  // vsako zabeležil opozorilo, čeprav je bila seja povsem veljavna. Sočasni klicatelji si
  // obnovo delijo (`refreshSession`), zato gre ven ENA zahteva za obnovo, ne ena na ploščico.
  if (!isExempt && needsRefreshNow(tokenStore.expiresAt(), new Date())) {
    return from(authService.refreshSession()).pipe(
      switchMap((outcome) => {
        if (outcome === 'session-invalid') {
          void authService.logout();
          return throwError(() => new HttpErrorResponse({ status: 401, url: req.url }));
        }
        // Ob nedosegljivem strežniku zahtevo vseeno pošljemo s starim žetonom: morda gre za
        // motnjo samo pri obnovi, in odgovor (tudi 401) je boljši od izmišljene napake.
        return sendWithRecovery();
      }),
    );
  }

  return sendWithRecovery();
};
