import { UserModel } from '../../modules/auth/models/user.model.js';

// research.md §7, tasks.md T052: avtomatizacija (API ključ, npr. n8n) nima `req.auth.subjectId`
// za osebne podatke (webhooki/scheduler — time-tracking/router.ts), saj API ključi niso
// vezani na enega uporabnika (člen III: API ključ ni geslo uporabnika). Ta pomožnik ugotovi,
// V ČIGAVEM imenu naj avtomatizacija deluje. Živi v `platform/`, ne v `modules/time-tracking/`,
// ker dostopa do `User` modela iz modula `auth` — člen I ustave prepoveduje modulom
// neposreden medsebojni uvoz, dovoljuje pa dostop prek skupnih storitev (platform/).
export async function resolveAutomationOwnerUserId(): Promise<string | null> {
  // Prednostno tisti, ki je prevzel podedovane podatke iz enouporabniške dobe (FR-013/FR-014)
  // — najbolj verjeten "lastnik" avtomatizacije, nastavljene pred 004.
  const admin = await UserModel.findOne({ migratedLegacyDataAt: { $ne: null } });
  if (admin) return String(admin._id);

  // Brez podedovanih podatkov (še nihče ni prevzel enouporabniške dobe): če obstaja natanko
  // en uporabnik, avtomatizacija deluje V NJEGOVEM imenu — nedvoumno pri obsegu te
  // aplikacije (plan.md Scale/Scope: peščica uporabnikov). Pri 0 ali >1 uporabnikih ni
  // varne privzete izbire.
  const candidates = await UserModel.find().limit(2).select('_id').lean();
  if (candidates.length === 1) return String(candidates[0]!._id);
  return null;
}
