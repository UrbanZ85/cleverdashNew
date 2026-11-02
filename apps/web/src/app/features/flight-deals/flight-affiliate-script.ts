import { DOCUMENT } from '@angular/common';
import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';

// Zunanji skript partnerske povezave za rezervacije letov (emrldtp.cc). Naložen je samo na straneh "Leti",
// ne v celotni aplikaciji: varuh poti ga ob prvem vstopu doda v <head>. Skripta v SPA ni mogoče odnaložiti,
// zato po prvem obisku ostane do osvežitve; drugič se ne doda.

const SCRIPT_ID = 'flight-affiliate-script';
const SCRIPT_SRC = 'https://emrldtp.cc/NTg3NTU3.js?t=587557';

export const flightAffiliateScriptGuard: CanActivateFn = () => {
  const doc = inject(DOCUMENT);
  if (!doc.getElementById(SCRIPT_ID)) {
    const script = doc.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.setAttribute('data-cmp-ab', '2');
    script.src = SCRIPT_SRC;
    doc.head.appendChild(script);
  }
  return true;
};
