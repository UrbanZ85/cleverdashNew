import { inject } from '@angular/core';
import type { HttpInterceptorFn } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { TokenStore } from './token.store.js';
import { AuthService } from './auth.service.js';

// Poti za izdajo/obnovo žetona se izognejo temu interceptorju — brez tega bi neuspela
// obnova sprožila samo sebe v neskončno zanko. Ista logika, ki jo pozna backend
// (Idempotency-Key izjema, člen III), se tu ponovi na strani odjemalca.
const AUTH_EXEMPT = ['/auth/login', '/auth/refresh'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenStore = inject(TokenStore);
  const isExempt = AUTH_EXEMPT.some((p) => req.url.includes(p));

  const token = tokenStore.accessToken();
  const withAuth = !isExempt && token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(withAuth).pipe(
    catchError((err: unknown) => {
      if (isExempt || !(err instanceof HttpErrorResponse) || err.status !== 401) {
        return throwError(() => err);
      }
      const authService = inject(AuthService);
      return from(authService.silentRefresh()).pipe(
        switchMap((ok) => {
          if (!ok) {
            void authService.logout();
            return throwError(() => err);
          }
          const retried = req.clone({
            setHeaders: { Authorization: `Bearer ${tokenStore.accessToken()}` },
          });
          return next(retried);
        }),
      );
    }),
  );
};
