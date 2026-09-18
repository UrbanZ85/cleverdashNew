# Tasks: Recepti (013)

Stanje ob zaključku veje: **vse naloge opravljene**. Seznam je urejen po odvisnostih, tako da ga je
mogoče brati kot zapis o tem, v kakšnem vrstnem redu je modul nastal — in kot vrstni red, po
katerem bi ga bilo treba razstaviti.

Oznaka `[P]` pomeni, da naloga ne blokira naslednje in bi lahko tekla vzporedno.

## Faza 1 — Domenska plast (brez baze, brez strežnika)

- [x] **T001** `domain/capabilities.ts` — dve stopnji, devet zmožnosti, `denyReason` kot edina pot
      do odločitve. [P]
- [x] **T002** `domain/recipe-url.ts` — normalizacija; `normalizeOptionalRecipeUrl` loči
      `undefined` / `null` / niz. [P]
- [x] **T003** `domain/search-text.ts` — `foldForSearch`, `buildSearchText` (brez korakov),
      `foldTag`. [P]
- [x] **T004** `domain/image-type.ts` — podpis datoteke, varno ime za `Content-Disposition`,
      `checkImageUpload`. [P]
- [x] **T005** `domain/share-token.ts` — 128-bitni žeton, preverba oblike, `buildRecipeShareUrl`. [P]
- [x] **T006** `domain/recipe-jsonld.ts` — `@graph`, `HowToSection`, `@type` kot seznam, ISO 8601
      trajanje. [P]
- [x] **T007** `domain/recipe-input.ts` — zod sheme, `splitLines`, `normalizeTags`,
      `buildRecipesFilter`.
- [x] **T008** `scopes.ts` — trije obsegi, `share` ločen od `write`. [P]

### Testi faze 1

- [x] **T009** `tests/unit/recipes-capabilities.spec.ts` — matrika 3 vloge × 9 zmožnosti,
      izčrpno. (36 testov)
- [x] **T010** `tests/unit/recipes-domain.spec.ts` — naslov, oznake, iskanje, podpisi slik,
      oblika žetona. (35 testov)
- [x] **T011** `tests/unit/recipes-jsonld.spec.ts` — vsi trije robovi iz research.md §9.
      (16 testov)

> **Kaj sta testa našla:** `parseInstructions` je deljenje po vrsticah opravljal ZA `stripTags`, ki
> presledke strne — en dolg niz s postopkom se zato ni razbil. In `safeImageFileName` je nedovoljene
> znake brisal namesto nadomeščal, kar je dalo varno, a nerazpoznavno ime. Oboje popravljeno.

## Faza 2 — Modela

- [x] **T012** `models/recipe.model.ts` — agregat, štirje indeksi, `versionKey: false`.
- [x] **T013** `models/recipe-image.model.ts` — `Buffer` s `select: false`, `enum` nad `mimeType`
      kot druga zapora. [P]

## Faza 3 — Storitve

- [x] **T014** `services/recipe-access.service.ts` — `requireRecipe` kot EDINA vrata; 404 za tujca,
      403 za soudeleženca; `upsertMember` v dveh pogojenih pisanjih.
- [x] **T015** `services/recipe-import.service.ts` — varovalo odhodnih naslovov, ročne
      preusmeritve, proračun čez vse skoke, omejeno branje telesa. [P]
- [x] **T016** `services/public-throttle.service.ts` — okno v pomnilniku, meja sledenih ključev. [P]

## Faza 4 — Usmerjevalnika

- [x] **T017** `router.ts` — seznam, CRUD, `cooked`, `import`, `seen`.
- [x] **T018** `router.ts` — slike: nalaganje prek `express.raw`, pomanjšava, prenos naslovne ob
      brisanju, varnostne glave.
- [x] **T019** `router.ts` — deljenje: soudeleženci pod `share`, odhod pod `write`, javna povezava.
- [x] **T020** `public.router.ts` — `/shared-recipes/*`; eksplicitna projekcija, enak odgovor za
      vse neveljavne žetone, `no-store`.

## Faza 5 — Vklop (docs/adding-a-tab.md)

- [x] **T021** `platform/tabs/registry.ts` — en vnos, `order: 1` (edina prosta vrednost).
- [x] **T022** `main.ts` — dva `apiV1Router.use(...)`.
- [x] **T023** `platform/keycloak/role-mapping.ts` — trije nizi v `BASE_USER_SCOPES`.
- [x] **T024** `platform/config/env.ts` + `.env.example` — sedem spremenljivk, vse s privzetkom.

### Testi faze 2–5

- [x] **T025** `tests/contract/recipes/_helpers.ts` — prijava skozi PRAVI tok (zaradi
      `lastLoginAt`), sejanje receptov, bajti slik.
- [x] **T026** `tests/contract/recipes/crud.spec.ts` — 18 testov.
- [x] **T027** `tests/contract/recipes/sharing.spec.ts` — 13 testov.
- [x] **T028** `tests/contract/recipes/images.spec.ts` — 13 testov.
- [x] **T029** `tests/contract/recipes/public-link.spec.ts` — 12 testov.

> **Kaj so testi našli:** `GET /recipes/{id}` je hkrati odprtje in oznako "novo" pobriše, zato
> `isNew` v njegovem odgovoru po definiciji ne more biti `true`. Test je bil popravljen, da vedenje
> preverja prek seznama — kar je tudi mesto, kjer oznako vidi uporabnik. Vedenje strežnika je
> ostalo nespremenjeno, ker je pravilno.

## Faza 6 — Odjemalec

- [x] **T030** `recipes.model.ts` — tipi in čiste funkcije za prikaz. [P]
- [x] **T031** `recipes.api.ts` — slike prek `HttpClient` in NE prek `<img src>` (prestreznik). [P]
- [x] **T032** `image-resize.ts` — pomanjšava v `<canvas>`, neuspeh ni usoden. [P]
- [x] **T033** `recipes.page.ts` — mreža kartic, iskanje, oznake, obseg, razvrstitev; sproščanje
      `objectURL`.
- [x] **T034** `recipe-editor.page.ts` — ogled, urejanje, slike, ocena, "skuhano", način kuhanja z
      `wakeLock`.
- [x] **T035** `recipe-share-dialog.component.ts` — soudeleženci in javna povezava, strogo ločena.
- [x] **T036** `public/recipe-public.page.ts` — `/r/:token`, samo branje.
- [x] **T037** `app.routes.ts` — tri poti; javna pred lovilcem `**`, brez obeh varuhov.
- [x] **T038** `core/icons/register-icons.ts` + `tests/unit/icons.spec.ts` — pet novih ikon.
- [x] **T039** `tests/unit/recipes-model.spec.ts` — 9 testov. [P]

## Faza 7 — Dokumentacija

- [x] **T040** `contracts/openapi.yaml` — 13 poti, 10 shem.
- [x] **T041** `spec.md`, `research.md`, `data-model.md`, `plan.md`, ta datoteka.
- [x] **T042** `README.md` — odstavek o funkcionalnosti 013.

## Faza 8 — Kategorije (dopolnitev po prvem preizkusu)

Nastala iz dveh ugotovitev pri uporabi: deljenja uporabnik ni našel (ikona brez besedila, in pri
ustvarjanju ga po naravi stvari ni), oznake pa za razvrstitev po obroku niso zadoščale — prosto
besedilo se razpiše v različice istega.

- [x] **T043** `models/recipe-category.model.ts` — besednjak, enoličen indeks na `{userId, key}`.
- [x] **T044** `domain/recipe-input.ts` — `normalizeCategories`, shemi besednjaka, `category` v
      poizvedbi, kategorija v filtru.
- [x] **T045** `recipe.model.ts` — `categories` + `categoryKeys` + indeks; `search-text.ts` jih
      zajame v iskanje.
- [x] **T046** `services/category.service.ts` — besednjak, samodejno dopolnjevanje ob pisanju
      recepta, preimenovanje čez recepte, izbris brez izgube receptov.
- [x] **T047** `categories.router.ts` — CRUD + vrstni red; `/order` PRED `/:categoryId`.
- [x] **T048** `router.ts` + `public.router.ts` — kategorije v zapisu, odgovoru in javni projekciji.
- [x] **T049** `main.ts` — tretji `apiV1Router.use(...)`.
- [x] **T050** `tests/contract/recipes/categories.spec.ts` — 19 testov.
- [x] **T051** Odjemalec: `category-manager.component.ts`, čipi in filter v seznamu, izbirnik v
      urejevalniku, kategorije na javni strani.
- [x] **T052** Odjemalec: **vrstica "Deljenje"** z besedilom in stanjem namesto same ikone.
- [x] **T053** Pogodba, `spec.md` (US10, FR-080…FR-088), `data-model.md`, `research.md` §15,
      `README.md`, ta datoteka.

> **Kaj je bilo treba popraviti sproti:** pogodba je kategorije obljubila tudi na javni strani,
> projekcija v `public.router.ts` pa jih ni vračala. Ujeto pri branju pogodbe vštric kodi, ne s
> testom — javni test preverja, česa v odgovoru NE sme biti, ne pa česa mora biti.

## Faza 9 — Popravek: shranjevanje recepta je padlo

Prijavljeno ob uporabi: "ne morem shraniti novega recepta".

- [x] **T054** `recipes.model.ts` — `FormFieldValue`, `asText`, `toOptionalCount`; `splitLines`
      sprejme tudi ne-niz.
- [x] **T055** `recipe-editor.page.ts` — obrazec uporablja obe pretvorbi; pogoj gumba "Shrani" je
      metoda in ne izraz v predlogi.
- [x] **T056** `recipe-editor.page.ts` — `describe()` loči napako ZAHTEVE od napake v naši kodi;
      druga gre v konzolo in to pove tudi uporabniku.
- [x] **T057** `tests/unit/recipes-model.spec.ts` (+6) in `tests/contract/recipes/crud.spec.ts` (+1).

> **Vzrok:** `IonInput` s `type="number"` prepiše `registerOnChange` in prek `ngModel` sporoči
> **število** (`parseFloat`) oziroma `null` za prazno polje — nikoli niza. Urejevalnik je klical
> `value.trim()`, kar je vrglo `TypeError` **sinhrono, znotraj `try` bloka v `save()`**. Padlo je
> vsako shranjevanje, pri katerem je bil vpisan čas priprave ali porcije — torej pri vsakem pravem
> receptu. Zahteva na API ni šla nikoli ven, uporabnik pa je videl le "Recepta ni bilo mogoče
> shraniti".
>
> **Kar to napako dela vredno zapisa:** v tem repozitoriju se je zgodila ŽE ENKRAT, pri krajih
> ploščice "Pot" (`features/settings/commute-form.ts`), in je bila tam natančno dokumentirana.
> Ponovila se je, ker je bil vzorec zapisan v tuji funkcionalnosti, uvoz med njimi pa prepoveduje
> člen I — in ker enotski testi urejevalnika niso pokrivali pretvorbe obrazca. Zdaj jo, v obeh
> smereh: pretvorba je čista funkcija s testi, obravnava napak pa loči hrošča od zavrnitve
> strežnika, da naslednja taka napaka ne bo spet neslišna.

## Kaj NI bilo narejeno (in je tako prav)

- **Ploščica na nadzorni plošči** — terja vpis zunaj modula; podatki zanjo v API-ju že so.
- **Preračun na porcije, nakupovalni seznam** — terja razčlenjene sestavine (research.md §12).
- **Zaklep recepta** — vse odločitve gredo skozi eno funkcijo, zato bo to vrstica v tabeli.
- **Hierarhija kategorij** (podkategorije) — ena raven, enako kot mape v modulu 008.
- **Samodejno razvrščanje v kategorije ob uvozu s strani** — `recipeCategory` iz schema.org gre
  med OZNAKE, ne med kategorije: besednjak je uporabnikova razvrstitev in tuja stran vanj ne sme
  pisati.
- **Popravek `tests/contract/timesheet/workbook.spec.ts`** — napaka `Buffer<ArrayBufferLike>` je
  starejša od te veje in ni njena. Popravek sodi v svoj PR, sicer bi bila v tej veji sprememba,
  ki je specifikacija ne pokriva.
