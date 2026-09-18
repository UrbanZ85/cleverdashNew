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
  // 011: meritve ARSO postaje po urah. `requiredScopes` je tu prvi pravi filter zavihka —
  // brez `meteo:read` zavihek v meniju ne nastane (resolver.ts), namesto da bi se pojavil in
  // ob odprtju vrnil 403.
  {
    id: 'meteo',
    title: 'Meritve postaj',
    icon: 'rainy-outline',
    route: '/meteo',
    order: 2,
    requiredScopes: ['meteo:read'],
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
  // 008: knjižnica shranjenih strani. Namenoma LOČENA od vtičnika vrste `link` iz 005 — ta je
  // ploščica z nekaj vedno vidnimi bližnjicami, ta zavihek pa knjižnica, ki s časom raste in
  // jo je treba znati preiskati in razvrstiti v mape (research.md §1).
  {
    id: 'saved-links',
    title: 'Shranjeni linki',
    icon: 'bookmarks-outline',
    route: '/saved-links',
    order: 8,
    enabled: true,
  },
  // 013: kuharica. Drugi zavihek, katerega zapisi so lahko vidni več kot enemu uporabniku (glej
  // `todos` zgoraj) in PRVI, ki ima ob tem javno stran za nekoga BREZ računa — za register to ni
  // razlika, je pa razlog, da modul nosi tri obsege.
  //
  // Javna stran (`/r/:token`) tu NAMENOMA ni: ni zavihek, ni v meniju in ne sme biti odvisna od
  // tega, ali ima lastnik zavihek vklopljen (FR-071) — enako kot `/d/:token` pri 009.
  {
    id: 'recipes',
    title: 'Recepti',
    icon: 'restaurant-outline',
    route: '/recipes',
    // `order: 1` je edina PROSTA vrednost v registru (0 in 2–10 so zasedene). Izbrana je zato, da
    // dodajanje tega zavihka ne premakne nobenega obstoječega — enak `order` pri dveh vnosih bi
    // njun medsebojni vrstni red prepustil razvrščanju, ki ni stabilno določeno, in bi meni ob
    // vsakem zagonu lahko izrisal drugače.
    order: 1,
    requiredScopes: ['recipes:read'],
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
  // 014: PRVI zavihek, ki ga ne vidi vsak uporabnik. `requiredScopes: ['admin']` pomeni v
  // `resolveTabs` (coversRequiredScopes) točno to, kar piše: kdor obsega nima, zavihka v `GET
  // /tabs` NE DOBI — ni izklopljen, ni ga. Razlika do `meteo` in `recipes` je, da tam obseg
  // razlikuje med "modul obstaja" in "uporabnik ga sme", tu pa med dvema vrstama ljudi.
  //
  // `order: 11` in ne nižje: 0–10 so zasedene in enak `order` pri dveh vnosih bi njun medsebojni
  // vrstni red prepustil nestabilnemu razvrščanju (glej opombo pri `recipes`). Mesto za
  // Nastavitvami je ob tem tudi pravo: orodje, ki ga vidi en človek in ne vsak dan, ne sodi med
  // zavihke, ki se uporabljajo.
  {
    id: 'analytics',
    title: 'Analitika',
    icon: 'stats-chart-outline',
    route: '/analytics',
    order: 11,
    requiredScopes: ['admin'],
    enabled: true,
  },
];
