import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { TabRegistryService } from './tab-registry.service.js';

// Robni primer iz spec.md: "Bodi na zavihku, ki se medtem izklopi → Preusmeritev na
// dashboard, brez napake." Guard preveri register ob vsakem poskusu navigacije; `/dashboard`
// je edini pravi izjema, ker je začetni zaslon NAD zavihki (spec.md, Assumptions) — nima
// kam pasti nižje, zato je vedno dosegljiv, tudi če bi bil v registru izklopljen.
//
// Opomba: to ne prestreže uporabnika, ki že MIRUJE na strani, ki medtem postane izklopljena
// — canActivate se sproži samo ob poskusu navigacije, ne ob spremembi podatka v ozadju.
export const tabGuard: CanActivateFn = async (route) => {
  const tabRegistry = inject(TabRegistryService);
  const router = inject(Router);

  const path = `/${route.routeConfig?.path ?? ''}`;
  if (path === '/dashboard') return true;

  try {
    await tabRegistry.ensureLoaded();
  } catch {
    return true; // prehodna napaka omrežja ne sme blokirati navigacije (FR-026 duh)
  }

  return tabRegistry.isRouteEnabled(path) ? true : router.parseUrl('/dashboard');
};
