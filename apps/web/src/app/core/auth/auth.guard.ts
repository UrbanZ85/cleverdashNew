import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service.js';

// Nujna žica za usmerjanje: brez tega bi bil dashboard dosegljiv brez prijave. Od US3
// (tasks.md T085) dalje to zamenja `TabRegistryService`, ki iste odločitve sprejema iz
// razrešenega registra zavihkov — ta guard ostane za poti, ki niso zavihek (dashboard je
// začetni zaslon nad zavihki, glej spec.md Assumptions).
//
// 004: dostopni žeton živi samo v pomnilniku (token.store.ts) — ob vsakem zagonu/osvežitvi
// strani je zato prazen, tudi če je httpOnly sejni piškotek še povsem veljaven. Guard zato
// NAJPREJ poskusi tiho obnovo prek piškotka (`ensureSession()`), preden odloči — brez tega
// bi vsaka osvežitev strani po nepotrebnem preusmerila nazaj na Keycloaka.
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  if (await auth.ensureSession()) return true;
  // Zahtevani naslov gre s prijavo naprej, sicer se vsaka globoka povezava (zaznamek,
  // povezava iz obvestila, prilepljen naslov) po prijavi izgubi in konča na dashboardu —
  // `login()` privzame '/'. Strežnik vrednost sprejme le, če je pot znotraj aplikacije
  // (`safeRedirectPath` v modules/auth/router.ts).
  auth.login(state.url); // preusmeritev brskalnika na /api/v1/auth/login — stran se zapusti
  return false;
};
