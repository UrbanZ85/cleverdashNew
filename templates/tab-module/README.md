# Predloga: nov zavihek

Ta mapa je predloga za dodajanje novega zavihka (člen I ustave, SC-005). Podroben postopek
je v `docs/adding-a-tab.md`. Na kratko:

1. Skopiraj `api/__tab_id__/` v `apps/api/src/modules/<ime>/` in `web/__tab_id__/` v
   `apps/web/src/app/features/<ime>/`.
2. Zamenjaj `__tab_id__` z dejanskim imenom (angleško, kebab-case).
3. Dodaj en vnos v `apps/api/src/platform/tabs/registry.ts`.
4. Vpni usmerjevalnik modula v `apps/api/src/main.ts` (en `apiV1Router.use(...)` klic — glej
   komentar tam) in pot v `apps/web/src/app/app.routes.ts`.

Nič drugega se ne sme spremeniti. Če popravljaš datoteko zunaj novega modula in teh dveh
vpisov, si naredil nekaj narobe — glej `apps/api/tests/integration/tab-isolation.spec.ts`.
