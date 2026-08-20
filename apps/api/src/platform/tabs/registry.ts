// Poglavje A.5 iz nacrt/002-time-tracking/plan.md, člen I in člen X ustave: naslovi so
// slovenski (domenski podatek), `id` in `route` sta angleška (vmesnik). Dodajanje zavihka
// je dodajanje enega vnosa sem in ene mape — nič drugega se ne sme spremeniti (SC-005).
//
// V 001 je registriran samo `dashboard`, ker je edini zaslon, ki dejansko obstaja.
// `cameras` (003) in `time-tracking` (002) prideta kot nova vnosa, ko obstaja njuna koda —
// register jih MORA sprejeti brez sprememb tega, kar je že tu (spec.md, "Kaj ni v obsegu").
export interface TabDefinition {
  id: string;
  title: string;
  icon: string;
  route: string;
  order: number;
  requiredScopes?: string[];
  /** Privzeta vrednost, dokler je nastavitve (T081) ne prekrijejo — FR-003. */
  enabled: boolean;
}

export const TAB_REGISTRY: TabDefinition[] = [
  {
    id: 'dashboard',
    title: 'Nadzorna plošča',
    icon: 'home-outline',
    route: '/dashboard',
    order: 0,
    enabled: true,
  },
];
