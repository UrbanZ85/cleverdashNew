# Dodajanje novega zavihka

Člen I ustave: vsak zavihek je samostojen modul, moduli se ne kličejo med sabo neposredno,
odstranitev zavihka je brisanje ene mape in enega vnosa v registru. Ta postopek to
uveljavlja korak za korakom. Predloga za kopiranje je v `templates/tab-module/`.

## Postopek

1. **Skopiraj predlogo.**

   ```
   templates/tab-module/api/__tab_id__/  →  apps/api/src/modules/<ime>/
   templates/tab-module/web/__tab_id__/  →  apps/web/src/app/features/<ime>/
   ```

   Zamenjaj `__tab_id__` z dejanskim imenom povsod — v imenih map, datotek in
   identifikatorjev v kodi. Ime je angleško, kebab-case (npr. `time-tracking`), ker je del
   vmesnika (člen X). Naslov zavihka, ki ga vidi uporabnik, je slovenski.

2. **Dodaj en vnos v register.**

   `apps/api/src/platform/tabs/registry.ts` — dodaj objekt v `TAB_REGISTRY`:

   ```ts
   {
     id: 'moj-zavihek',
     title: 'Moj Zavihek',       // slovensko
     icon: 'construct-outline',   // ime Ionicons ikone
     route: '/moj-zavihek',
     order: 10,
     enabled: true,
   }
   ```

3. **Vpni usmerjevalnik modula.** V `apps/api/src/main.ts` je komentar, ki označuje edino
   mesto za to:

   ```ts
   apiV1Router.use(mojZavihekRouter);
   ```

4. **Dodaj pot na strani odjemalca.** V `apps/web/src/app/app.routes.ts`:

   ```ts
   {
     path: 'moj-zavihek',
     loadComponent: () => import('./features/moj-zavihek/moj-zavihek.page.js').then((m) => m.MojZavihekPage),
     canActivate: [authGuard, tabGuard],
   },
   ```

## Kaj se NE sme spremeniti

Nič drugega. Če popravljaš datoteko zunaj novega modula in teh dveh vpisov (register +
usmerjanje), je nekaj narobe zasnovano — preveri, ali modul poskuša uvoziti iz drugega
modula namesto iz `platform/`, `domain/`, `core/` ali `shared/`. Lint pravilo v
`eslint.config.js` tak uvoz zavrne kot napako, ne kot opozorilo.

`apps/api/tests/integration/tab-isolation.spec.ts` dokazuje, da en potisk v `TAB_REGISTRY`
zadošča, da se zavihek pojavi v `GET /tabs`, v meniju in v spodnji vrstici — brez sprememb
resolverja, usmerjevalnika ali frontend komponent menija.

## Odstranitev zavihka

Obratno: izbriši mapo modula na obeh straneh, odstrani vnos iz `TAB_REGISTRY`, odstrani
vrstico v `main.ts` in pot v `app.routes.ts`. `npm run typecheck`, `npm run lint` in testi
morajo po tem ostati čisti — to je SC-005.
