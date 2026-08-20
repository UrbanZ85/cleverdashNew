import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service.js';

// Nujna žica za usmerjanje: brez tega bi bil dashboard dosegljiv brez prijave. Od US3
// (tasks.md T085) dalje to zamenja `TabRegistryService`, ki iste odločitve sprejema iz
// razrešenega registra zavihkov — ta guard ostane za poti, ki niso zavihek (dashboard je
// začetni zaslon nad zavihki, glej spec.md Assumptions).
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return true;
  return router.parseUrl('/login');
};
