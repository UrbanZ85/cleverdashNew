import { Router } from 'express';

/** Koren za `/api/v1`. Posamezni moduli vanj vpnejo svoje pod-usmerjevalnike
 * (`apps/api/src/main.ts`). `cors()` se nikjer ne namesti — člen II: enotni izvor,
 * Caddy usmeri `/api/*` na ta strežnik, vse ostalo na SPA. */
export const apiV1Router = Router();
