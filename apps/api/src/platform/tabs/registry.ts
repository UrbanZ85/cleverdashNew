// Poglavje A.5 iz nacrt/002-time-tracking/plan.md, člen I in člen X ustave: naslovi so
// slovenski (domenski podatek), `id` in `route` sta angleška (vmesnik). Dodajanje zavihka
// je dodajanje enega vnosa sem in ene mape — nič drugega se ne sme spremeniti (SC-005).
//
// V 001 je bil registriran samo `dashboard`. `time-tracking` (002) in `cameras` (003) sta
// bila dodana kot nova vnosa, ko je nastala njuna koda — register ju je sprejel brez
// sprememb tega, kar je bilo že tu (spec.md, "Kaj ni v obsegu").
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
  {
    id: 'notes',
    title: 'Beležke',
    icon: 'reader-outline',
    route: '/notes',
    order: 3,
    enabled: true,
  },
  {
    id: 'time-tracking',
    title: 'Beleženje časa',
    icon: 'time-outline',
    route: '/time-tracking',
    order: 5,
    enabled: true,
  },
  {
    id: 'cameras',
    title: 'Kamere',
    icon: 'videocam-outline',
    route: '/cameras',
    order: 7,
    enabled: true,
  },
  {
    id: 'timesheet',
    title: 'Evidenca delovnega časa',
    icon: 'document-text-outline',
    route: '/timesheet',
    order: 6,
    enabled: true,
  },
  // 009: PRVI zavihek, ki je privzeto IZKLOPLJEN. Zahteva ("modul samo za uporabnika, če si
  // ga enabla") ga postavlja kot stvar izbire, za razliko od ostalih, ki so del tega, kar
  // CleverDash je. Resolver to podpira brez sprememb: `resolveTabs` prekrije privzetek z
  // osebno nastavitvijo, `listAllTabsForUser` pa vrne TUDI izklopljene, prav zato, da jih je
  // v nastavitvah mogoče najti in vklopiti (platform/tabs/resolver.ts).
  //
  // Javna stran za prevzem (`/d/:token`) tu NAMENOMA ni: ni zavihek, ni v meniju in ne sme
  // biti odvisna od tega, ali ima lastnik zavihek vklopljen (FR-073).
  {
    id: 'file-sharing',
    title: 'Deljenje datotek',
    icon: 'cloud-upload-outline',
    route: '/file-sharing',
    order: 9,
    enabled: false,
  },
  // 010: prvi zavihek, katerega zapisi so lahko vidni VEČ kot enemu uporabniku (seznam ima
  // `ownerId` in `members`, ne `userId`). Za register to ni razlika — zavihek je zavihek —
  // je pa razlog, da modul nosi tri obsege namesto dveh (modules/todos/scopes.ts).
  {
    id: 'todos',
    title: 'Opravila',
    icon: 'checkbox-outline',
    route: '/todos',
    order: 4,
    enabled: true,
  },
  {
    id: 'settings',
    title: 'Nastavitve',
    icon: 'settings-outline',
    route: '/settings',
    order: 10,
    enabled: true,
  },
];
