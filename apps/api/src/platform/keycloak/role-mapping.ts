// research.md §6, člen IX ustave: preslikava Keycloak vlog/skupin v CleverDashev obstoječi
// `scopes` model je ČISTA funkcija, testabilna brez omrežja. `admin` je edini poseben obseg
// (platform/auth/scopes.ts) — pomeni "vsi obsegi". `KEYCLOAK_USER_ROLE` je ločena, osnovna
// vloga: brez nje ALI admin vloge CleverDash osebo NE prepozna (FR-007/FR-008) — sam uspešen
// obstoj Keycloak računa ne zadošča, prepoznana vloga/skupina mora biti dodeljena.

export interface RoleMappingResult {
  /** Ali sme uporabnik sploh vstopiti (FR-007) — ne glede na to, ali je admin. */
  hasAccess: boolean;
  /** CleverDashevi obsegi, izpeljani iz vlog (research.md §6). */
  scopes: string[];
}

// Popravek med implementacijo (glej research.md §6): prvotna zamisel je dala
// `KEYCLOAK_USER_ROLE` PRAZEN seznam scopeov ("osnovni dostop brez posebnih scopeov"). To se
// je izkazalo za napačno — FR-010/FR-011 zahtevata, da ima VSAK uporabnik (ne samo admin)
// lastno, izolirano rabo kamer in beleženja časa, ti moduli pa zahtevajo poimenovane scope-e
// (`cameras:read` ipd., glej modules/*/scopes.ts). Podatkovna izolacija med uporabniki je po
// 004 zagotovljena z `userId` na vsaki poizvedbi (T048–T052), NE s scope sistemom — zato
// poimenovani "aplikacijski" scope-i ne ločijo več admina od navadnega uporabnika (razlika je
// izključno `admin` obseg sam, glej FR-013: upravljanje API ključev). Ti nizi so dobesedno
// prepisani (NE uvoženi iz modulov) zavoljo člena I ustave ("moduli se ne smejo klicati med
// sabo") — odstranitev modula tako pusti tukaj neuporabljen niz, ne pokvarjenega uvoza.
const BASE_USER_SCOPES: readonly string[] = [
  'cameras:read',
  'cameras:write',
  'state:read',
  'action:write',
  'schedule:read',
  'schedule:write',
  'calendar:read',
  'calendar:write',
  'history:read',
  'webhooks:write',
  'health:read',
  'timesheet:generate',
  'timesheet:read',
  'timesheet:write',
  'notes:read',
  'notes:write',
  // 009 — brez teh dveh bi zavihek "Deljenje datotek" delal samo administratorju
  // (docs/adding-a-tab.md, korak 5). Niza sta PREPISANA, ne uvožena iz modula (člen I).
  'file-sharing:read',
  'file-sharing:write',
  // 010 — brez teh treh bi zavihek "Opravila" delal samo administratorju
  // (docs/adding-a-tab.md, korak 5). Nizi so PREPISANI, ne uvoženi iz modula (člen I).
  // `todos:share` je namenoma ločen od `todos:write`: glej modules/todos/scopes.ts.
  'todos:read',
  'todos:write',
  'todos:share',
];

/** Preslika seznam Keycloak vlog/skupin (iz `realm_access.roles` ali `groups` claima) v
 * CleverDashev dostop in `scopes`. */
export function mapRolesToAccess(roles: string[], adminRole: string, userRole: string): RoleMappingResult {
  const isAdmin = roles.includes(adminRole);
  const isUser = roles.includes(userRole);
  const hasAccess = isAdmin || isUser;
  const scopes = isAdmin ? ['admin'] : isUser ? [...BASE_USER_SCOPES] : [];
  return { hasAccess, scopes };
}
