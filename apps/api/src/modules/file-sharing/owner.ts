import type { Request } from 'express';
import { resolveAutomationOwnerUserId } from '../../platform/auth/automation-owner.js';
import { notFound } from '../../platform/errors/problem.js';

/**
 * V čigavem imenu teče ta zahteva.
 *
 * Isti pomočnik kot v `modules/timesheet/router.ts`: API ključ ni vezan na uporabnika, zato je
 * treba ugotoviti, v čigavem imenu deluje avtomatizacija (platform/auth/automation-owner.ts).
 * Brez tega bi `userId` na zapisu postal identifikator ključa in datoteka (ali predal) ne bi
 * pripadala nikomur.
 *
 * 009b: iz `router.ts` prenesen v svojo datoteko, ko sta lastnikova usmerjevalnika v tem modulu
 * postala dva (`/files*` in `/inboxes*`). Dva izvoda tega izračuna bi pomenila dve razlagi
 * lastništva v istem modulu.
 */
export async function resolveOwnerUserId(req: Request): Promise<string> {
  if (req.auth!.subjectType === 'user') return req.auth!.subjectId;
  const ownerId = await resolveAutomationOwnerUserId();
  if (!ownerId) {
    throw notFound(
      'Avtomatizacija ne more ugotoviti, na katerega uporabnika se nanaša — ni podedovanih podatkov niti natanko enega uporabnika.',
    );
  }
  return ownerId;
}
