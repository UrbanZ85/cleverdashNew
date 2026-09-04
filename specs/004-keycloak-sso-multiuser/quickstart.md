# 004 — Zagon in preverjanje (Phase 1)

Navodilo za zagon in **dokazovanje**, da funkcionalnost deluje. Ni navodilo za izvedbo — koda
in naloge pridejo v `tasks.md` po `/speckit-tasks`.

Bere se skupaj s [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md) in [contracts/openapi.yaml](./contracts/openapi.yaml).
Predpostavlja dokončano 001–003 (glej njihove `quickstart.md`) — ta dokument ne ponavlja
splošne postavitve (Caddy, TLS, Mongo, Docker Compose), ker 004 v njej ne spremeni ničesar
(spec.md Assumptions: Keycloak je zunanji, obstoječ sistem, brez novega kontejnerja v
`infra/docker-compose.yml`).

---

## 1. Keycloak za razvoj/preverjanje

Produkcija uporablja organizacijski Keycloak (spec.md Assumptions) — ni del tega repozitorija.
Za lokalni razvoj in `/speckit-implement` preverjanje je najhitreje pognati začasen Keycloak
ločeno od `infra/docker-compose.yml` (ni del produkcijskega sklada, glej plan.md Technical
Context):

```bash
docker run -p 8080:8080 -e KEYCLOAK_ADMIN=admin -e KEYCLOAK_ADMIN_PASSWORD=admin \
  quay.io/keycloak/keycloak:26 start-dev
```

V admin konzoli (`http://localhost:8080`):

1. Ustvari realm `cleverdash-dev`.
2. Ustvari klienta (confidential): `client-id=cleverdash-api`,
   `redirect_uri=http://localhost:3000/api/v1/auth/callback`, zabeleži `client secret`.
3. Ustvari vlogo `cleverdash-admin` in vlogo `cleverdash-user`.
4. Ustvari vsaj dva testna uporabnika (npr. `alice`, `bob`) z gesli; `alice` dobi vlogo
   `cleverdash-admin`, `bob` samo `cleverdash-user` — za preverjanje Story 2/3 spodaj.

Avtomatski testi (`npm run test`) tega ne potrebujejo — glej research.md §3 (ponarejen OIDC
strežnik v testnem procesu).

---

## 2. Kar je treba dodatno izpolniti v `.env`

```
KEYCLOAK_ISSUER_URL=http://localhost:8080/realms/cleverdash-dev
KEYCLOAK_CLIENT_ID=cleverdash-api
KEYCLOAK_CLIENT_SECRET=<iz koraka 1.2>
KEYCLOAK_ADMIN_ROLE=cleverdash-admin
KEYCLOAK_USER_ROLE=cleverdash-user
KEYCLOAK_INTROSPECTION_CACHE_SECONDS=5
SESSION_COOKIE_SECRET=<32+ naključnih znakov>
```

Odstrani (niso več v shemi, glej research.md §12): `PASSWORD_HASH_ALGO`,
`ADMIN_INITIAL_PASSWORD`, `JWT_REFRESH_SECRET`. `ADMIN_EMAIL` odpade — administratorja
določa Keycloakova vloga (`KEYCLOAK_ADMIN_ROLE`), ne več `.env` vrednost.

**Preveri pred prvim commitom:** enako kot 001–003 — `git status` brez `.env`, gitleaks čist.
`KEYCLOAK_CLIENT_SECRET` in `SESSION_COOKIE_SECRET` živita izključno v `.env` (člen IV).

---

## 3. Story 1 — prijava prek Keycloaka namesto gesla

1. Odpri CleverDash brez veljavne seje (zasebno okno brskalnika).
2. **Pričakovano**: preusmeritev na Keycloakovo prijavno stran (`localhost:8080/realms/cleverdash-dev/...`),
   NE stara stran z e-pošto/geslom (spec.md Acceptance Scenario 1).
3. Prijavi se kot `alice`. **Pričakovano**: preusmeritev nazaj v CleverDash, prijavljen.
4. Odpri `GET /api/v1/auth/me` (prek DevTools ali `curl` s piškotkom) — preveri `displayName`,
   `scopes` vsebuje vrednost, izpeljano iz `cleverdash-admin` (research.md §6).
5. Ustvari uporabnika BREZ nobene Keycloak vloge, prijavi se z njim. **Pričakovano**: `401` z
   jasnim sporočilom o odsotnosti dostopa (FR-007), ne generična napaka prijave.
6. Klikni "Odjava". **Pričakovano**: preusmeritev na Keycloakov `end_session_endpoint`
   (research.md §10) in nazaj; naslednji obisk CleverDasha znova zahteva prijavo (ne tiho
   ponovno prijavljen prek še vedno žive Keycloak seje — dokazuje enotno odjavo, FR-004).
7. Poskusi odpreti `/login` (staro pot). **Pričakovano**: ne obstaja/preusmeri v tok prijave
   prek Keycloaka (Acceptance Scenario 4).

---

## 4. Story 2 — vsak uporabnik ima svojo, ločeno aplikacijo

1. Prijavi se kot `alice` (drug brskalnik/zasebno okno kot `bob`).
2. Spremeni temo, dodaj/premakni ploščico na nadzorni plošči, dodaj kamero.
3. Prijavi se kot `bob` v ločeni seji.
4. **Pričakovano**: `bob` NE vidi Aličinih sprememb — privzete nastavitve, prazen seznam
   kamer (SC-002, 0 % navzkrižnega uhajanja).
5. `bob` doda svojo kamero in vnos v beleženju časa; osveži Aličino sejo.
6. **Pričakovano**: Alica ne vidi Bobovih podatkov in obratno.
7. Preveri v bazi neposredno (`mongosh`): `db.cameras.find()` — vsak dokument ima različen,
   pravilen `userId` (data-model.md).

---

## 5. Story 3 — vloga iz Keycloaka odloča o pravicah

1. V Keycloak admin konzoli odvzemi `bob`-u vlogo `cleverdash-user` (ali mu jo popolnoma
   izbriši/onemogoči račun).
2. Medtem ko ima `bob` v CleverDashu še odprt zavihek, sproži poljubno zahtevo (npr. osveži
   stran ali počakaj `KEYCLOAK_INTROSPECTION_CACHE_SECONDS`).
3. **Pričakovano**: naslednja zahteva je zavrnjena — dostop prekinjen praktično takoj
   (FR-006, SC-003), ne šele čez minute.
4. Dodaj `bob`-u nazaj vlogo `cleverdash-admin`; ob naslednji prijavi/obnovitvi preveri, da
   `GET /auth/me` zdaj vrne razširjen `scopes` (FR-011/FR-012).

---

## 6. Selitev obstoječih (enouporabniških) podatkov — FR-013/FR-014

Na sistemu z obstoječimi 001–003 podatki (singleton `Settings`, kamere in profili brez
`userId`, iz stanja PRED to funkcionalnostjo):

1. Prijavi se prvič kot uporabnik z vlogo `cleverdash-admin`.
2. **Pričakovano**: ta uporabnik po prijavi vidi stare nastavitve/kamere/zgodovino
   (research.md §7 migracija), `User.migratedLegacyDataAt` je nastavljen.
3. Prijavi se z drugim, novim uporabnikom.
4. **Pričakovano**: ta NE vidi podedovanih starih podatkov — dobi prazne privzetke (Acceptance
   Scenario 4, User Story 2).

---

## 7. Kar ostane nespremenjeno (negativni test — dokaz "plitke" spremembe)

Po plan.md Summary: `GET/PUT /settings`, `/cameras/*`, `/time-tracking/*` NE spremenijo obliko
zahteve/odgovora. Preveri, da obstoječi kontraktni testi (`apps/api/tests/contract/settings.spec.ts`
in ustrezni za cameras/time-tracking) prehajajo BREZ sprememb pričakovanih shem — samo
podatek, ki ga vrnejo, je zdaj vezan na prijavljenega uporabnika, ne na fiksen singleton.
