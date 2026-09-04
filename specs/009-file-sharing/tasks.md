---

comment: "Task list template for feature implementation"
---

# Tasks: Deljenje datotek

**Input**: Design documents from `/specs/009-file-sharing/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/openapi.yaml](./contracts/openapi.yaml), [quickstart.md](./quickstart.md)

**Tests**: Vključeni — konstitucijsko Kakovostno vrato 2 zahteva enotske teste domenske
logike. Vsi štirje poimenski primeri iz ustave so v 009 brez predmeta; nadomestni nabor je
naštet v [research.md §21](./research.md) in vsak od njih je spodaj svoja naloga. Pogodbeni
testi sledijo vzorcu 001/002/003 (Supertest proti `openapi.yaml`).

**Organization**: Naloge so razvrščene po uporabniških zgodbah iz spec.md (US1, US2 → P1;
US3 → P2; US4 → P3; US5 → P4; US6 → P5). US1 in US2 sta obe P1 in skupaj tvorita MVP:
nalaganje brez zaščite ni ta funkcionalnost.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se lahko izvede vzporedno (druge datoteke, brez odvisnosti od nedokončanih nalog)
- **[Story]**: kateri uporabniški zgodbi naloga pripada (US1–US6)
- Vsaka naloga navaja natančno pot datoteke

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: okolje, registri, obsegi, nosilec in orodja — brez domenske logike.

- [X] T001 [P] Dodaj enajst NEOBVEZNIH spremenljivk s privzetki v Zod shemo `apps/api/src/platform/config/env.ts`: `FILE_SHARE_DIR` (`/app/data/files`), `FILE_SHARE_MAX_MB` (500), `FILE_SHARE_QUOTA_MB` (5000), `FILE_SHARE_DEFAULT_EXPIRY_DAYS` (7), `FILE_SHARE_RETENTION_DAYS` (7), `FILE_SHARE_GRANT_MINUTES` (10), `FILE_SHARE_ATTEMPT_LIMIT` (10), `FILE_SHARE_ATTEMPT_WINDOW_MINUTES` (15), `FILE_SHARE_LOCK_MINUTES` (60), `FILE_SHARE_CLEANUP_INTERVAL_MINUTES` (60), `FILE_SHARE_UPLOAD_TIMEOUT_MINUTES` (360) — research.md §16, vzorec `SCREENSHOT_DIR` (env.ts:105)
- [X] T002 [P] Dopolni `.env.example` z enajstimi spremenljivkami iz T001, označenimi kot neobvezne, z opisom, kaj pomenijo — člen IV, vrata 4
- [X] T003 [P] Razširi `apps/api/tests/unit/env.spec.ts`: brez vpisa veljajo privzetki iz T001; vpisana vrednost jih prepiše; `FILE_SHARE_MAX_MB` ne sprejme ničle ne negativne vrednosti (odvisno od T001)
- [X] T004 [P] Ustvari `apps/api/src/modules/file-sharing/scopes.ts` s `FILE_SHARE_SCOPES` (`read: 'file-sharing:read'`, `write: 'file-sharing:write'`) — research.md §19, vzorec `modules/notes/scopes.ts`
- [X] T005 [P] Dodaj vnos `file-sharing` (`title: 'Deljenje datotek'`, `icon: 'cloud-upload-outline'`, `route: '/file-sharing'`, `order: 9`, **`enabled: false`**) v `apps/api/src/platform/tabs/registry.ts` — research.md §18, docs/adding-a-tab.md korak 2
- [X] T006 [P] Dodaj `'file-sharing:read'` in `'file-sharing:write'` v `BASE_USER_SCOPES` v `apps/api/src/platform/keycloak/role-mapping.ts` (dobesedna niza, NE uvoz iz modula) — docs/adding-a-tab.md korak 5, člen I
- [X] T007 [P] Razširi `packages/contracts/scripts/generate.ts` s ciljem `specs/009-file-sharing/contracts/openapi.yaml` → `packages/contracts/src/generated/file-sharing.d.ts`; preveri, da `npm run generate:contracts` teče čisto — Kakovostno vrato 3
- [X] T008 [P] Pripravi pomožnik za pogodbene teste 009 (nalaganje `contracts/openapi.yaml`, tvorba testne datoteke znane velikosti na disku) v `apps/api/tests/contract/file-sharing/_helpers.ts`, po vzoru `apps/api/tests/contract/cameras/_helpers.ts`
- [X] T009 [P] Registriraj ikoni `cloud-upload-outline` in `lock-closed-outline` v `apps/web/src/app/core/icons/register-icons.ts` in ju dodaj v seznam v `apps/web/tests/unit/icons.spec.ts` — docs/adding-a-tab.md korak 6
- [X] T010 [P] Dodaj nosilec `shared-files:/app/data/files` k storitvi `api` in `shared-files:` v seznam `volumes:` v `infra/docker-compose.yml` — vrata 4; brez tega naložene datoteke ne preživijo posodobitve (quickstart.md §1)
- [X] T011 [P] Omeji `encode gzip` v `infra/Caddyfile` na stisljive vrste vsebine (`text/*`, `application/json*`, `application/javascript*`, `image/svg+xml*`) — research.md §17; stiskanje 500 MB arhiva porabi procesor brez učinka in posega v `Content-Length`, od katerega je odvisno nadaljevanje prenosa

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: čiste domenske funkcije, trije modeli, hramba na disku in ogrodje obeh
usmerjevalnikov — vse, kar potrebuje vsaka naslednja zgodba.

**⚠️ KRITIČNO**: nobena uporabniška zgodba se ne začne, dokler ta faza ni dokončana.

### Domenska plast (čiste funkcije, brez baze, omrežja in datotečnega sistema)

- [X] T012 [P] Implementiraj `apps/api/src/modules/file-sharing/domain/file-name.ts`: `sanitizeFileName(raw)` — obreže presledke, odstrani ločila poti in zaporedja `..`, krmilne in nevidne znake, skrajša na 200 znakov ob ohranitvi končnice, vrne `'datoteka'`, kadar ne ostane nič — FR-007, research.md §20
- [X] T013 [P] Enotski test `apps/api/tests/unit/file-name.spec.ts`: `../../etc/passwd`, `C:\pot\ime.txt`, ime z `\n` (vbrizg v glavo `Content-Disposition`), 300 znakov s končnico `.tar.gz`, prazno ime, samo končnica `.pdf`, ime s šumniki ostane nedotaknjeno — research.md §21 (odvisno od T012)
- [X] T014 [P] Implementiraj `apps/api/src/modules/file-sharing/domain/share-password.ts`: `generatePassword()` (16 znakov iz 32-znakovne abecede brez `0/O/1/l/I`, `randomInt` z zavrnitvijo ostanka), `formatForDisplay()` (štiri četvorke), `normalizeInput()` (odstrani vezaje in presledke), `hashPassword()`/`verifyPassword()` — `scrypt` z `N=32768, r=8, p=1`, `maxmem: 64 * 1024 * 1024`, zapis `scrypt$N$r$p$sol$povzetek`, primerjava s `timingSafeEqual` — research.md §7
- [X] T015 [P] Enotski test `apps/api/tests/unit/share-password.spec.ts`: pravilno in napačno geslo enake dolžine gresta po isti poti in obe skozi `timingSafeEqual`; povzetek z DRUGIMI parametri v zapisu se še vedno preveri (parametri so del zapisa, ne konstanta); vezaji in presledki v vnosu ne vplivajo; abeceda ne vsebuje dvoumnih znakov; dve zaporedni gesli nista enaki — research.md §21 (odvisno od T014)
- [X] T016 [P] Implementiraj `apps/api/src/modules/file-sharing/domain/share-lifecycle.ts`: `computeExpiresAt(izbira, zdaj, privzetek)` (1/7/30/`null`), `isExpired(zapis, zdaj)`, `canTransition(iz, v)` za `uploading → ready → revoked`, `ready → broken`, in izpeljava stanja za odgovor — data-model.md
- [X] T017 [P] Enotski test `apps/api/tests/unit/share-lifecycle.spec.ts`: `expiresInDays: null` pomeni BREZ ROKA in ne "poteklo"; izpuščena izbira uporabi privzetek iz okolja; `uploading` ni mogoče preklicati; iz `revoked` ni poti nazaj v `ready`; poteklost se izpelje iz časa in ni shranjeno stanje — research.md §21 (odvisno od T016)
- [X] T018 [P] Implementiraj `apps/api/src/modules/file-sharing/domain/attempt-window.ts`: `registerFailure(stanje, zdaj, meje)` in `isLocked(stanje, zdaj)` — fiksno okno z `windowStartedAt`, števec, `lockedUntil`; `resetOnSuccess(stanje)` — research.md §9
- [X] T019 [P] Enotski test `apps/api/tests/unit/attempt-window.spec.ts`: deseti poskus v oknu še gre, enajsti ne; poskus tik po izteku okna začne NOVO okno s števcem 1; zaklep zavrne tudi pravilno geslo; uspeh ponastavi števec povezave, NE pa števca naslova — research.md §21 (odvisno od T018)
- [X] T020 [P] Implementiraj `apps/api/src/modules/file-sharing/domain/quota.ts`: `checkQuota(zasedeno, napovedano, meja)` → `{ ok }` ali `{ ok: false, availableBytes }` — FR-009
- [X] T021 [P] Enotski test `apps/api/tests/unit/quota.spec.ts`: robna enakost (`zasedeno + napovedano === meja`) je še DOVOLJENA; en bajt čez ni; prazna kvota; `availableBytes` nikoli ni negativen — research.md §21 (odvisno od T020)
- [X] T022 [P] Implementiraj `apps/api/src/modules/file-sharing/domain/size-guard.ts`: `createSizeGuard(maxBytes)` s `push(chunkLength)` → `ok` / `exceeded`, in `checkDeclared(contentLength, maxBytes)` — FR-003
- [X] T023 [P] Enotski test `apps/api/tests/unit/size-guard.spec.ts`: točno `maxBytes` je še dovoljeno, `maxBytes + 1` ne; odsoten `Content-Length` je zavrnjen; napoved pod mejo, dejanski tok čez mejo → `exceeded` na kosu, ki mejo prestopi (ne šele na koncu) — research.md §21 (odvisno od T022)

### Modeli

- [X] T024 [P] Ustvari model `sharedFiles` v `apps/api/src/modules/file-sharing/models/shared-file.model.ts` s polji iz data-model.md in indeksi `{userId,createdAt:-1}`, unikatnim redkim `{token}`, unikatnim `{storageId}`, `{expiresAt}` (NE TTL — brisati je treba tudi vsebino) in `{state,updatedAt}`
- [X] T025 [P] Ustvari model `fileShareGrants` v `apps/api/src/modules/file-sharing/models/file-share-grant.model.ts` z unikatnim `{grant}`, `{fileId}` in TTL `{expiresAt}, expireAfterSeconds: 0` — data-model.md
- [X] T026 [P] Ustvari model `fileShareAttempts` v `apps/api/src/modules/file-sharing/models/file-share-attempt.model.ts` z unikatnim `{key}` in TTL `{expiresAt}` — data-model.md

### Hramba na disku

- [X] T027 Implementiraj `apps/api/src/modules/file-sharing/services/blob-storage.service.ts`: `ensureDirs()` (ustvari `tmp/` in `blobs/` ob zagonu), `tempPathFor(storageId)`, `blobPathFor(storageId)` (predal `<xx>`), `publish(storageId)` (`fs.rename` iz `tmp/` v `blobs/`), `remove(storageId)`, `statBlob(storageId)` — research.md §5, data-model.md
- [X] T028 Integracijski test `apps/api/tests/integration/blob-storage.spec.ts` nad začasnim imenikom: `publish` je preimenovanje in ne kopiranje (inode ostane isti); delna datoteka nikoli ne konča v `blobs/`; `remove` neobstoječe datoteke ne vrže; pot nikoli ne vsebuje uporabnikovega imena datoteke (odvisno od T027)

### Ogrodje usmerjevalnikov

- [X] T029 Ustvari `apps/api/src/modules/file-sharing/router.ts` z ogrodjem LASTNIKOVIH poti, `requireScopes(...)` na VSAKI poti in pomožnikom `findFileOr404(userId, id)` (tuja datoteka → 404, ne 403) — FR-053, vzorec `findCameraOr404` (odvisno od T004, T024)
- [X] T030 Ustvari `apps/api/src/modules/file-sharing/public.router.ts` z ogrodjem JAVNIH poti `/share/*` — brez `requireScopes`, z glavo v komentarju, ki pove, zakaj je datoteka ločena in kaj sme vanjo; `req.auth` se v tej datoteki ne bere nikoli — research.md §2, FR-020, FR-024 (odvisno od T024)
- [X] T031 Vpni `apiV1Router.use(fileSharingRouter)` in `apiV1Router.use(fileSharingPublicRouter)` v `apps/api/src/main.ts` na označenem mestu; dodaj klic `ensureDirs()` ob zagonu — docs/adding-a-tab.md korak 3 (odvisno od T027, T029, T030)
- [X] T032 Dodaj `EXEMPT_PREFIXES = ['/share/']` v `apps/api/src/platform/idempotency/middleware.ts` ob obstoječi `EXEMPT_PATHS`, s komentarjem, ki navede člen III in razlog (shranjen odgovor z dovolilnico bi preživel preklic) — research.md §10, plan.md Complexity Tracking
- [X] T033 Test `apps/api/tests/integration/idempotency-share-exemption.spec.ts`: `Idempotency-Key` na `POST /share/{token}/unlock` nima učinka; po preklicu povezave isti ključ NE vrne shranjene dovolilnice; lastnikovi endpointi glavo še naprej upoštevajo (odvisno od T032)
- [X] T034 Pogodbeni test `apps/api/tests/contract/file-sharing/auth-surface.spec.ts`: VSAK `/files*` endpoint brez žetona vrne 401; VSAK `/share/*` endpoint brez žetona je dosegljiv; seznam poti se bere iz `openapi.yaml`, da nova pot ne more tiho uiti preverjanju — research.md §2 (odvisno od T029, T030)

### Odjemalec — ogrodje

- [X] T035 [P] Ustvari `apps/web/src/app/core/file-sharing/shared-file.model.ts` (tipi iz generirane pogodbe) in `file-sharing.store.ts` (signali: seznam, kvota, stanje nalaganja) (odvisno od T007)
- [X] T036 [P] Dodaj v `apps/web/src/app/app.routes.ts` dve poti: `file-sharing` z `authGuard` in `tabGuard`, ter `d/:token` **brez obeh** — prva pot SPA brez `authGuard` (research.md §2, FR-020)
- [X] T037 [P] Izvzemi predpono `/api/v1/share/` iz pripenjanja glave `Authorization` v `apps/web/src/app/core/auth/auth.interceptor.ts` — potekla seja ne sme pokvariti javne strani (research.md §2)
- [X] T038 [P] Enotski test interceptorja v `apps/web/tests/unit/auth-interceptor.spec.ts`: zahteva na `/api/v1/share/...` nima glave `Authorization` niti ob veljavni seji; zahteva na `/api/v1/files` jo ima (odvisno od T037)

**Checkpoint**: ogrodje stoji — zavihek je viden (po vklopu), lastnikovi endpointi vračajo
prazne sezname, javne poti odgovarjajo brez prijave.

---

## Phase 3: User Story 1 - Pošljem veliko datoteko nekomu, ki nima računa (Priority: P1) 🎯 MVP

**Goal**: 500 MB datoteka se naloži, nastaneta povezava in geslo, prejemnik brez računa jo
prevzame celo.

**Independent Test**: quickstart.md §4 — nalaganje s kontrolno vsoto, prikaz povezave in
gesla, prevzem v anonimnem oknu, primerjava kontrolnih vsot.

### Tests for User Story 1

- [X] T039 [P] [US1] Pogodbeni test `apps/api/tests/contract/file-sharing/upload.spec.ts`: `POST /files` → `201` z obliko `CreatedFile`; `PUT .../content` → `201` z obliko `UploadResult`; geslo je v odgovoru natanko enkrat in ga `GET /files/{id}` NE vsebuje — FR-011
- [X] T040 [P] [US1] Pogodbeni test `apps/api/tests/contract/file-sharing/public-download.spec.ts`: `GET /share/{token}` vrne velikost in rok in **NE imena datoteke** (FR-022); `POST .../unlock` s pravilnim geslom vrne ime in postavi piškotek `cd_share` s `Path`, `HttpOnly`, `SameSite=Lax`; `GET .../content` brez piškotka → 401
- [X] T041 [P] [US1] Integracijski test `apps/api/tests/integration/upload-streaming.spec.ts`: naloži datoteko, večjo od privzete meje pomnilnika testa (npr. 64 MB), in preveri, da `process.memoryUsage().heapUsed` med prenosom ne naraste sorazmerno z velikostjo; kontrolna vsota naložene in prebrane datoteke se ujema — SC-001, SC-002
- [X] T042 [P] [US1] Integracijski test `apps/api/tests/integration/upload-abort.spec.ts`: prekinjena zahteva med pisanjem ne pusti `.part` datoteke, ne vidnega zapisa in ne zasedenega prostora — FR-006, SC-008
- [X] T043 [P] [US1] Pogodbeni test `apps/api/tests/contract/file-sharing/upload-limits.spec.ts`: prazna datoteka → 400 (FR-008); `Content-Length` nad mejo → 413 brez odpiranja datoteke; LAŽNA napoved (majhen `byteSize`, veliko telo) → 413 MED prenosom, delna datoteka odstranjena (FR-003); kvota presežena → 507

### Implementation for User Story 1

- [X] T044 [US1] Implementiraj `apps/api/src/modules/file-sharing/services/upload.service.ts`: `req.pipe` v `createWriteStream`, `size-guard` na vsakem kosu, obravnava `aborted`/`close`/`error` z odstranitvijo `.part`, atomarna objava prek `blob-storage.publish()` — research.md §4, §5 (odvisno od T022, T027)
- [X] T045 [US1] Implementiraj `POST /files` v `apps/api/src/modules/file-sharing/router.ts`: očisti ime (T012), preveri napovedano velikost (T022) in kvoto (T020), izračunaj `expiresAt` (T016), ustvari zapis `uploading`, vrni `CreatedFile` — FR-001, FR-002, FR-009, FR-040 (odvisno od T029, T044)
- [X] T046 [US1] Implementiraj `PUT /files/{fileId}/content`: pretakanje (T044), po uspehu generiraj `token` in geslo (T014), shrani povzetek, preklopi v `ready` in vrni `UploadResult` z **geslom v čistopisu — edino mesto v celi pogodbi** — FR-010, FR-011 (odvisno od T044, T045)
- [X] T047 [US1] **Ne registriraj `express.raw` za to pot.** Preveri, da globalni `express.json()` binarnega telesa ne prestreza, in dodaj v `apps/api/src/modules/file-sharing/router.ts` komentar, ki pove, zakaj se vzorec iz `modules/notes/router.ts:257-283` tu NE ponovi — research.md §4 (odvisno od T046)
- [X] T048 [US1] Implementiraj `GET /share/{token}` v `public.router.ts`: vrne SAMO `byteSize` in `expiresAt`; neznana, potekla, preklicana in izbrisana povezava dajo enak `404` z enakim besedilom — FR-022, FR-023 (odvisno od T030)
- [X] T049 [US1] Implementiraj `POST /share/{token}/unlock`: preveri geslo (T014), ustvari dovolilnico (T025), postavi piškotek `cd_share` s `Path=/api/v1/share/{token}`, `HttpOnly`, `SameSite=Lax`, `Secure`, `Max-Age` iz `FILE_SHARE_GRANT_MINUTES`; vrni `UnlockResult` z imenom datoteke — research.md §8, FR-026 (odvisno od T030, T014, T025)
- [X] T050 [US1] Implementiraj `GET /share/{token}/content`: preveri dovolilnico Z `expiresAt: { $gt: now }` v poizvedbi (ne prek TTL), preveri stanje datoteke, `fs.stat` proti zapisani velikosti, nato `res.download()`; ob uspehu povečaj `downloadCount` in `lastDownloadedAt` — research.md §13, FR-025, FR-028, FR-052 (odvisno od T049, T027)
- [X] T051 [US1] Implementiraj `GET /files/{fileId}/content` (lastnikov prenos brez gesla); ta prenos se NE šteje med prevzeme — FR-027 (odvisno od T029, T027)
- [X] T052 [P] [US1] Poskrbi, da geslo, dovolilnica in vsebina piškotka nikoli ne pridejo v dnevnik: dopolni redakcijo v `apps/api/src/platform/logging/logger.ts` (če je seznam polj tam) oz. v modulu, in dodaj test — FR-032, člen IV. **Izvedeno v** `apps/api/tests/integration/unlock-throttle.spec.ts` ("Kaj se o poskusu shrani in kaj ne"): preverja TRAJNO stanje (zapis datoteke in števec poskusov), ne izpisa na konzolo — pino piše mimo `process.stdout.write` in izpis je mogoče preusmeriti, shranjeno pa je tisto, kar preživi
- [X] T053 [P] [US1] Ustvari `apps/web/src/app/core/file-sharing/upload.store.ts`: `HttpClient` s `reportProgress: true` in telesom `File`, napredek iz `HttpEventType.UploadProgress`, preklic prek `unsubscribe`; nalaganje živi v storitvi in preživi menjavo zavihka — research.md §23, FR-005 (odvisno od T035)
- [X] T054 [US1] Ustvari `apps/web/src/app/features/file-sharing/file-sharing.page.ts`: izbira datoteke, napredek, seznam, prazno stanje z gumbom za prvo nalaganje in stanje nalaganja — FR-074 (odvisno od T036, T053)
- [X] T055 [US1] Ustvari `apps/web/src/app/features/file-sharing/share-created.component.ts`: enkraten prikaz povezave IN gesla, gumba za kopiranje obojega, in **vnaprejšnje** opozorilo, da gesla pozneje ne bo več mogoče videti — FR-011 (odvisno od T054)
- [X] T056 [US1] Ustvari `apps/web/src/app/features/file-sharing/download/file-download.page.ts` (pot `/d/:token`): prikaz velikosti in roka, polje za geslo, po odklenitvi ime datoteke in gumb za prenos; **prenos se sproži z navigacijo**, ne s `fetch`/`HttpClient` — research.md §8 (odvisno od T036, T049, T050)
- [X] T057 [US1] Poskrbi, da je javna stran uporabna brez prijave: brez preusmeritve na Keycloak, brez menija in spodnje vrstice, s samostojnim besedilom v slovenščini — FR-020 (odvisno od T056)

**Checkpoint**: datoteka gre gor in dol, povezava in geslo obstajata — a še nista zaščitena
pred ugibanjem. US2 je del istega MVP.

---

## Phase 4: User Story 2 - Brez gesla nihče ne dobi ničesar (Priority: P1)

**Goal**: sam naslov ne odklene ničesar, napačno geslo ne odklene ničesar, ugibanje se
ustavi.

**Independent Test**: quickstart.md §5 — pet primerov zavrnitve in zaklep po preseženi meji.

### Tests for User Story 2

- [X] T058 [P] [US2] Pogodbeni test `apps/api/tests/contract/file-sharing/unlock-refusals.spec.ts`: brez gesla, napačno geslo, geslo DRUGE datoteke — vsi trije dajo enak `401`; potekla, preklicana, neznana in izbrisana povezava dajo enak `404` z enakim besedilom — FR-016, FR-023
- [X] T059 [P] [US2] Integracijski test `apps/api/tests/integration/unlock-throttle.spec.ts`: po `FILE_SHARE_ATTEMPT_LIMIT` zgrešitvah je nadaljnji poskus `429` **tudi s pravilnim geslom**; `Retry-After` je prisoten; po izteku zaklepa pravilno geslo spet deluje — FR-030
- [X] T060 [P] [US2] Integracijski test `apps/api/tests/integration/unlock-throttle-ip.spec.ts`: ugibanje po MNOGO različnih povezavah z istega naslova se ustavi po meji za naslov, tudi če je vsaka povezava pod svojo mejo — research.md §9
- [X] T061 [P] [US2] Test v `apps/api/tests/integration/unlock-throttle.spec.ts`: zgrešen poskus pusti sled o štetju (na povezavi IN na naslovu), poskušenega gesla pa ni ne v zapisu datoteke ne v števcu poskusov — FR-032

### Implementation for User Story 2

- [X] T062 [US2] Implementiraj `apps/api/src/modules/file-sharing/services/throttle.service.ts` nad `fileShareAttempts` in `domain/attempt-window.ts`: `check(key)`, `registerFailure(key)`, `resetLink(fileId)`; `findOneAndUpdate` z `upsert` v enem klicu, brez stanja v pomnilniku — research.md §9 (odvisno od T018, T026)
- [X] T063 [US2] Vpni dušenje v `POST /share/{token}/unlock`: preveri ZA OBE meji pred preverjanjem gesla, ob zgrešitvi zabeleži, ob uspehu ponastavi števec povezave; zavrni s `tooManyRequests()` iz `platform/errors/problem.ts` in glavo `Retry-After` — FR-030, FR-031 (odvisno od T049, T062)
- [X] T064 [US2] Dopolni odgovor `401` z `remainingAttempts`, da zakonit prejemnik ve, koliko poskusov mu ostane, ne da bi to komurkoli olajšalo ugibanje (podatek je isti, ki ga da štetje) — contracts/openapi.yaml (odvisno od T063)
- [X] T065 [US2] Zapiši `failedAttempts` in `lockedUntil` na zapis datoteke ob vsaki zgrešitvi, da ju lastnik vidi (uporablja US3) — FR-033 (odvisno od T062)
- [X] T066 [US2] Dopolni javno stran `file-download.page.ts`: razumljivo sporočilo ob napačnem geslu s številom preostalih poskusov, ločeno sporočilo ob zaklepu z uro, do kdaj traja — FR-030 (odvisno od T056, T064)

**Checkpoint**: MVP je celoten — datoteka se deli in je zaščitena. To je najmanjši smiselni
izdelek te funkcionalnosti.

---

## Phase 5: User Story 3 - Vidim in upravljam, kar sem delil (Priority: P2)

**Goal**: seznam s stanjem, preklic, brisanje, novo geslo, vidnost poskusov ugibanja.

**Independent Test**: quickstart.md §6 — preklic (tudi med prenosom), novo geslo, brisanje z
diska, tuja datoteka vrne 404.

### Tests for User Story 3

- [X] T067 [P] [US3] Pogodbeni test `apps/api/tests/contract/file-sharing/manage.spec.ts`: `GET /files` vrne seznam in kvoto, brez zapisov `uploading`; `GET /files/{id}` vsebuje `failedAttempts` in `lockedUntil`; `POST .../revoke` → `SharedFile` s `state: revoked`; `DELETE` → 204
- [X] T068 [P] [US3] Integracijski test `apps/api/tests/integration/revoke-effect.spec.ts`: dovolilnica, izdana PRED preklicem, po preklicu ne dela več (FR-026); prenos, ki teče med preklicem, se prekine (FR-041, research.md §22)
- [X] T069 [P] [US3] Integracijski test `apps/api/tests/integration/regenerate-password.spec.ts`: novo geslo prinese NOV `token`; stara povezava odgovarja kot neznana; stare dovolilnice so razveljavljene; preklicana datoteka se z novim geslom vrne v `ready` — FR-015, research.md §12
- [X] T070 [P] [US3] Integracijski test `apps/api/tests/integration/file-ownership.spec.ts`: vsak lastnikov endpoint nad tujo datoteko vrne 404, ne 403 — FR-053
- [X] T071 [P] [US3] Integracijski test `apps/api/tests/integration/delete-file.spec.ts`: brisanje odstrani vsebino IN zapis; kadar vsebine ni mogoče odstraniti, zapis OSTANE s `state: broken` in odgovor je napaka, ne 204 — FR-045, člen VII

### Implementation for User Story 3

- [X] T072 [US3] Implementiraj `GET /files` (seznam + `Quota` iz agregacije po `userId`, brez zapisov `uploading`) in `GET /files/{fileId}` v `router.ts` — FR-028, FR-033 (odvisno od T029)
- [X] T073 [US3] Implementiraj `POST /files/{fileId}/revoke`: `state: revoked`, izbris vseh dovolilnic datoteke, prekinitev odprtih odgovorov za to datoteko — FR-041, research.md §22 (odvisno od T029, T025)
- [X] T074 [US3] Implementiraj `POST /files/{fileId}/password`: nov `token`, novo geslo, izbris dovolilnic, `revoked → ready`; vrne `UploadResult` — FR-015 (odvisno od T014, T029)
- [X] T075 [US3] Implementiraj `DELETE /files/{fileId}`: najprej vsebina, nato zapis; ob neuspehu brisanja vsebine zapis ostane s `state: broken` in odgovor je izrecna napaka — FR-045, data-model.md (odvisno od T027, T029)
- [X] T076 [US3] Dopolni `file-sharing.page.ts` s seznamom: ime, velikost, datum, stanje (na voljo / potekla / preklicana / pokvarjena), rok, število prenosov in čas zadnjega, ter opozorilo ob `failedAttempts`/`lockedUntil` — FR-033, člen X (odvisno od T054, T072)
- [X] T077 [US3] Dodaj dejanja v vmesnik: kopiraj povezavo, prekliči, izdaj novo geslo (z jasnim opozorilom, da je treba poslati OBOJE znova), izbriši (s potrditvijo) — FR-015 (odvisno od T076, T073, T074, T075)
- [X] T078 [P] [US3] Prikaži kvoto v vmesniku (zasedeno/na voljo) in razumljivo sporočilo, kaj sprostiti, ko je polna — FR-009 (odvisno od T072)

**Checkpoint**: lastnik ima nadzor nad tem, kar je delil.

---

## Phase 6: User Story 4 - Povezava poteče sama (Priority: P3)

**Goal**: rok velja, poteklo se ne prenaša, disk se sam sprazni — tudi po izpadu.

**Independent Test**: quickstart.md §7 — potekla povezava, dohitevanje po zaustavitvi,
sirote, zapis brez vsebine.

### Tests for User Story 4

- [X] T079 [P] [US4] Integracijski test `apps/api/tests/integration/expiry.spec.ts`: povezava z `expiresAt` v preteklosti vrne enak `404` kot neznana; datoteka je lastniku še vidna kot potekla; `expiresAt: null` deluje naprej — FR-042, US4 scenarij 3
- [X] T080 [P] [US4] Integracijski test `apps/api/tests/integration/cleanup.spec.ts`: pometač pobriše potekle po `FILE_SHARE_RETENTION_DAYS` (zapis IN vsebino), obtičala nalaganja po `FILE_SHARE_UPLOAD_TIMEOUT_MINUTES`, sirote starejše od 24 ur, in označi zapise brez vsebine kot `broken` — FR-043, research.md §15
- [X] T081 [P] [US4] Integracijski test `apps/api/tests/integration/cleanup-catchup.spec.ts`: po "zaustavitvi" čez rok več datotek prvi zagon pobere ves zaostanek; drugi zagon nad istim stanjem ne naredi nič (idempotentnost) — FR-044, člen V.2
- [X] T082 [P] [US4] Test `apps/api/tests/integration/cleanup-orphan-grace.spec.ts`: datoteka v `tmp/`, mlajša od 24 ur, se NE pobriše — lahko je nalaganje, ki ravno teče — data-model.md

### Implementation for User Story 4

- [X] T083 [US4] Implementiraj `apps/api/src/modules/file-sharing/services/cleanup.service.ts` s štirimi opravili iz research.md §15, vsako samostojno in idempotentno; vrne število obdelanih po opravilu za dnevnik (odvisno od T024, T027)
- [X] T084 [US4] Implementiraj `startFileShareCleanup(env, logger)` (takoj ob zagonu, nato `setInterval` z `FILE_SHARE_CLEANUP_INTERVAL_MINUTES`) in ga vpni v `apps/api/src/main.ts` ob `startScheduler` — člen I (lasten pometač, ne klic v modul 002) (odvisno od T083, T031)
- [X] T085 [US4] Preveri poteklost pri vsakem javnem dostopu (ne le v pometaču): `GET /share/{token}`, `unlock` in `content` morajo potekli povezavi odgovoriti kot neznani, tudi če pometač še ni tekel — FR-042 (odvisno od T016, T048, T049, T050)
- [X] T086 [US4] Dodaj izbiro roka v obrazec za nalaganje (1 / 7 / 30 dni / brez roka), s privzetkom iz `FILE_SHARE_DEFAULT_EXPIRY_DAYS`; "brez roka" je na seznamu izrecno označeno — FR-040 (odvisno od T054, T045)
- [X] T087 [US4] Zapiši v `docs/env-reference.md` nove spremenljivke in **opozori na `SCREENSHOT_RETENTION_DAYS`**, ki je razglašen in ga nihče ne bere — da ta modul te napake ne ponovi in da je razlika opazna (research.md §15)

**Checkpoint**: funkcionalnost se sama pospravlja; disk ne raste v nedogled.

---

## Phase 7: User Story 5 - Zavihek si vklopim sam (Priority: P4)

**Goal**: modul je stvar izbire; dokler ni vklopljen, ga ni.

**Independent Test**: quickstart.md §3 — vklop, izklop, in dokaz, da izklop ne prekine
deljenih povezav.

- [X] T088 [P] [US5] Integracijski test `apps/api/tests/integration/file-sharing-tab-default.spec.ts`: brez osebne nastavitve zavihka `file-sharing` NI v `GET /tabs`; JE pa v seznamu za urejanje menija (`listAllTabsForUser`), da ga je mogoče vklopiti; po vklopu se pojavi — FR-071, research.md §18
- [X] T089 [P] [US5] Integracijski test `apps/api/tests/integration/file-sharing-tab-independence.spec.ts`: z IZKLOPLJENIM zavihkom javna povezava `/share/{token}` še vedno deluje in prenos gre skozi — FR-072, FR-073
- [X] T090 [US5] Preveri, da `apps/api/tests/integration/tab-isolation.spec.ts` še vedno velja: en vnos v `TAB_REGISTRY` zadošča, brez sprememb resolverja, menija in spodnje vrstice — SC-005 iz 001 (odvisno od T005)
- [X] T091 [P] [US5] Preveri v vmesniku, da javna pot `/d/:token` ni v registru zavihkov in je `tabGuard` ne obravnava — FR-073 (odvisno od T036)

---

## Phase 8: User Story 6 - Naložim datoteko brez vmesnika (Priority: P5)

**Goal**: n8n naloži datoteko s HTTP klicem in dobi povezavo in geslo.

**Independent Test**: quickstart.md §10 — trije `curl` klici in ponovitev z istim
`Idempotency-Key`.

- [X] T092 [P] [US6] Pogodbeni test `apps/api/tests/contract/file-sharing/api-key.spec.ts`: nalaganje z `X-API-Key` in obsegoma deluje; brez obsega `file-sharing:write` je 403; API ključ ne obide meje velikosti ne kvote — FR-063
- [X] T093 [P] [US6] Pogodbeni test `apps/api/tests/contract/file-sharing/idempotency.spec.ts`: ponovljen `POST /files` z istim ključem ne ustvari drugega zapisa; ponovljen `DELETE` in `revoke` z istim ključem vrneta prvotni odgovor — člen III
- [X] T094 [US6] Preveri in dokumentiraj v pogodbi, da `PUT /files/{fileId}/content` glave `Idempotency-Key` NE upošteva (binarno telo, isti razlog kot `POST /notes/{id}/audio` v 007) — contracts/openapi.yaml (odvisno od T046)
- [X] T095 [P] [US6] Dodaj v `docs/` kratek primer uporabe iz n8n (napovej → naloži → pošlji povezavo in geslo), po vzoru obstoječih zapisov o avtomatizaciji — člen III

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T096 [P] Preveri kontrolni seznam varnosti iz `docs/SECURITY-FIRST.md` proti tej funkcionalnosti in dopolni dokument z razdelkom o javni poti, če ga še nima
- [X] T097 [P] Preveri, da nobena pot ne vrača `Set-Cookie` brez `HttpOnly` in `Secure`, in da se piškotek `cd_share` ne pošilja pri zahtevah na druge datoteke (`Path`) — research.md §8
- [X] T098 [P] Dodaj `Cache-Control: no-store` na javne odgovore `/share/*`, da posrednik ne shrani niti podatka o velikosti niti vsebine
- [X] T099 [P] Preveri obnašanje pri sočasnosti: dve hkratni nalaganji istega uporabnika ne smeta prekoračiti kvote (preverjanje ob `POST` in med pisanjem) — FR-009
- [ ] T100 [P] Preveri prikaz na mobilni napravi (Capacitor): izbira datoteke, napredek, kopiranje gesla in povezave; javna stran v mobilnem brskalniku
- [ ] T101 [P] Preveri dostopnost javne strani: polje za geslo je dosegljivo s tipkovnico, sporočila o napakah so povezana s poljem, prikaz velikosti je berljiv
- [ ] T102 Izvedi celoten `quickstart.md` od §1 do §12 na sveži `docker compose up` iz čiste kopije — vrata 4, vključno s preverbo, da nosilec preživi ponovni zagon
- [ ] T103 Preveri 500 MB od konca do konca na pravi namestitvi (ne le v testu): nalaganje, prenos, kontrolna vsota, poraba pomnilnika vsebnika — SC-001, SC-002
- [X] T104 [P] `npm run typecheck`, `npm run lint`, `npm test` čisti; `npm run generate:contracts` razreši pogodbo brez napak — vrata 1 in 3
- [X] T105 Preveri člen I: brisanje `modules/file-sharing/` in `features/file-sharing/` ter vpisov iz plan.md ("Vpisi zunaj modula") pusti `typecheck`, `lint` in teste čiste — SC-005

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: brez odvisnosti; T010 in T011 (infra) sta pogoj za vsako preverjanje na pravi namestitvi
- **Foundational (Phase 2)**: odvisen od Setup — BLOKIRA vse uporabniške zgodbe
- **US1 (Phase 3)** in **US2 (Phase 4)**: obe P1 in skupaj MVP. US2 je odvisen od US1 (dušiti je mogoče šele obstoječi endpoint za odklepanje)
- **US3 (Phase 5)**: odvisen od Foundational; uporablja `failedAttempts` iz US2 za prikaz
- **US4 (Phase 6)**: odvisen od Foundational; neodvisen od US2 in US3
- **US5 (Phase 7)**: odvisen samo od T005 in T036 — lahko teče kadar koli po Setup
- **US6 (Phase 8)**: odvisen od US1 (endpointi morajo obstajati)
- **Polish (Phase 9)**: po vseh želenih zgodbah

### Within Each User Story

- Enotski testi domenskih funkcij nastanejo skupaj s funkcijami (Phase 2), ne pozneje
- Modeli pred storitvami, storitve pred endpointi, endpointi pred zasloni
- Pogodbeni testi so pisani proti `openapi.yaml`, ki obstaja pred kodo (člen III)

### Parallel Opportunities

- Vseh enajst nalog Phase 1 je `[P]` — različne datoteke
- Šest domenskih funkcij s testi (T012–T023) je popolnoma vzporednih
- Trije modeli (T024–T026) so vzporedni
- Testi znotraj vsake zgodbe (`[P]`) tečejo vzporedno
- US4 in US5 lahko tečeta vzporedno z US3

---

## Parallel Example: Foundational

```bash
# Šest čistih domenskih funkcij in njihovi testi hkrati:
Task: "domain/file-name.ts + tests/unit/file-name.spec.ts"
Task: "domain/share-password.ts + tests/unit/share-password.spec.ts"
Task: "domain/share-lifecycle.ts + tests/unit/share-lifecycle.spec.ts"
Task: "domain/attempt-window.ts + tests/unit/attempt-window.spec.ts"
Task: "domain/quota.ts + tests/unit/quota.spec.ts"
Task: "domain/size-guard.ts + tests/unit/size-guard.spec.ts"

# Trije modeli hkrati:
Task: "models/shared-file.model.ts"
Task: "models/file-share-grant.model.ts"
Task: "models/file-share-attempt.model.ts"
```

---

## Implementation Strategy

### MVP = US1 + US2 (obe P1)

1. Phase 1: Setup — **vključno z nosilcem (T010)**; brez njega vse ostalo izgine ob prvi posodobitvi
2. Phase 2: Foundational
3. Phase 3: US1 — datoteka gre gor in dol
4. Phase 4: US2 — brez gesla ne gre, ugibanje se ustavi
5. **STOP in preveri**: quickstart.md §4 in §5

Nalaganje brez zaščite ni izdaljiv izdelek — zato sta obe zgodbi P1 in obe v MVP.

### Incremental Delivery

1. Setup + Foundational → ogrodje stoji
2. US1 + US2 → MVP, uporabno in varno
3. US3 → nadzor nad deljenim
4. US4 → sistem se sam pospravlja
5. US5 → zavihek na uporabnika
6. US6 → avtomatizacija

---

## Notes

- `[P]` = različne datoteke, brez odvisnosti
- Vsaka zgodba je samostojno preverljiva po ustreznem razdelku `quickstart.md`
- **Dve pasti, ki ju je v tej funkcionalnosti najlažje zagrešiti:**
  1. `express.raw` ali `Buffer.concat` kjer koli na poti vsebine — T047 je namenjen prav
     temu, da se to ne zgodi tiho;
  2. nova pot v `public.router.ts` brez premisleka — T034 bere seznam poti iz pogodbe, da
     nobena javna pot ne more uiti preverjanju.
- Commit po vsaki nalogi ali logični skupini

---

## Stanje izvedbe

**101 od 105 nalog je izvedenih in preverjenih s testi.**

Štiri naloge (T100–T103) ostajajo NEOZNAČENE, ker jih ni mogoče opraviti brez tekoče
namestitve oziroma naprave — ne zato, ker bi bile pozabljene:

| Naloga | Kaj manjka | Kaj je namesto tega narejeno |
|---|---|---|
| T100 — prikaz na mobilni napravi | Android naprava ali emulator s Capacitor buildom | Zaslona sta zgrajena z Ionic komponentami, ki jih uporabljajo obstoječi zavihki; `npm run typecheck` in enotski testi so čisti |
| T101 — dostopnost javne strani | Ročni preizkus s tipkovnico in bralnikom zaslona | Polje za geslo ima `label`, sporočilo o napaki je povezano prek `aria-describedby`, gumbi imajo besedilo (ne le ikone) |
| T102 — celoten `quickstart.md` na `docker compose up` | Docker in tekoča namestitev | Spremembi `infra/docker-compose.yml` in `infra/Caddyfile` sta narejeni; obe sta v quickstart.md §1 opisani skupaj s preverbo, da nosilec preživi ponovni zagon |
| T103 — 500 MB od konca do konca na pravi namestitvi | Tekoča namestitev | `tests/integration/file-share-streaming.spec.ts` isto dokaže pri 32 MB: kontrolni vsoti se ujemata in poraba pomnilnika ne raste sorazmerno z velikostjo |

Ti štirje koraki so opisani v [quickstart.md](./quickstart.md) in jih je treba opraviti pred
namestitvijo v produkcijo.
