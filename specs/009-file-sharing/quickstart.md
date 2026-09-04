# 009 — Zagon in preverjanje (Phase 1)

**Spec**: [spec.md](./spec.md) | **Načrt**: [plan.md](./plan.md) | **Pogodba**:
[contracts/openapi.yaml](./contracts/openapi.yaml)

Ta dokument je navodilo za PREVERJANJE, da funkcionalnost dela — ne opis izvedbe. Kaj se
kodira, je v [tasks.md](./tasks.md).

## 1. Predpogoji

Nobene nove sistemske odvisnosti in nobenega novega zabojnika. **Dve spremembi `infra/`** pa
sta obvezni in ju je treba imeti pred preverjanjem:

1. `infra/docker-compose.yml` — nov nosilec pri storitvi `api`:

   ```yaml
   volumes:
     - ${FCM_KEY_FILE}:/run/secrets/fcm_key:ro
     - screenshots:/app/data/screenshots
     - shared-files:/app/data/files      # 009
   ```

   in vpis `shared-files:` med `volumes:` na dnu datoteke. Docker ga ustvari sam ob prvem
   zagonu — vrata 4 ostanejo izpolnjena.

2. `infra/Caddyfile` — `encode gzip` dobi ujemanje po vrsti vsebine (research.md §17), da
   500 MB posnetka ne stiskamo brez učinka.

**Preveri, da nosilec res drži:**

```bash
docker compose up -d
docker compose exec api sh -c 'touch /app/data/files/preveri && ls -la /app/data/files'
docker compose restart api
docker compose exec api ls -la /app/data/files      # `preveri` mora biti še tam
docker compose exec api rm /app/data/files/preveri
```

Če datoteka po ponovnem zagonu izgine, nosilec ni montiran in vse ostalo v tem dokumentu je
brez pomena — naložene datoteke bi izginile ob prvi posodobitvi.

## 2. `.env`

**Nič ni treba dodati.** Enajst novih nastavitev ima privzetke v kodi
(`platform/config/env.ts`) in so v `.env.example` dokumentirane kot neobvezne:

| Spremenljivka | Privzetek | Kaj je |
|---|---|---|
| `FILE_SHARE_DIR` | `/app/data/files` | koren hrambe |
| `FILE_SHARE_MAX_MB` | `500` | največja ena datoteka |
| `FILE_SHARE_QUOTA_MB` | `5000` | kvota na uporabnika |
| `FILE_SHARE_DEFAULT_EXPIRY_DAYS` | `7` | privzeti rok povezave |
| `FILE_SHARE_RETENTION_DAYS` | `7` | koliko po poteku vsebina še obstaja |
| `FILE_SHARE_GRANT_MINUTES` | `10` | veljavnost dovolilnice |
| `FILE_SHARE_ATTEMPT_LIMIT` | `10` | zgrešeni poskusi do zaklepa |
| `FILE_SHARE_ATTEMPT_WINDOW_MINUTES` | `15` | okno štetja |
| `FILE_SHARE_LOCK_MINUTES` | `60` | trajanje zaklepa |
| `FILE_SHARE_CLEANUP_INTERVAL_MINUTES` | `60` | perioda pometača |
| `FILE_SHARE_UPLOAD_TIMEOUT_MINUTES` | `360` | kdaj je nalaganje obtičalo |

Za preverjanje dušenja in poteka je praktično začasno znižati `FILE_SHARE_ATTEMPT_LIMIT` na
`3` in `FILE_SHARE_LOCK_MINUTES` na `1`.

## 3. Vklop zavihka (US5)

Zavihek je **privzeto izklopljen** (FR-071) — to je prvi tak v projektu, zato je to prvi
korak in ne opomba.

1. Prijavi se. V meniju zavihka "Deljenje datotek" NI.
2. Nastavitve → zavihki → vklopi "Deljenje datotek".
   → pojavi se v meniju brez ponovne prijave.
3. Izklopi ga nazaj → izgine iz menija. **Že deljene povezave morajo delovati naprej**
   (FR-072) — preveri po točki 4.
4. Vklopi ga nazaj za preostanek preverjanja.

## 4. Nalaganje in prevzem (US1)

Pripravi si testno datoteko znane velikosti in kontrolne vsote:

```bash
head -c 500000000 /dev/urandom > velika.bin        # 500 MB
sha256sum velika.bin
```

1. V zavihku izberi `velika.bin` in naloži.
   → med nalaganjem teče napredek; menjava zavihka nalaganja ne prekine (research.md §23).
2. Po koncu se pokažeta **povezava in geslo**, oboje s kopiranjem.
   → opozorilo pove, da gesla pozneje ne bo več mogoče videti.
3. **SC-002:** med nalaganjem spremljaj pomnilnik vsebnika:

   ```bash
   docker stats --no-stream cleverdash-api-1
   ```

   → poraba ne sme rasti sorazmerno z velikostjo datoteke. Če se približuje 500 MB, telo
   nekje konča v pomnilniku in `express.raw` se je prikradel nazaj.
4. Odpri povezavo v **drugem brskalniku ali v anonimnem oknu** (prejemnik ni prijavljen).
   → stran pokaže velikost in rok. **Imena datoteke NE sme pokazati** (FR-022).
5. Vpiši geslo → pokaže se ime, klik na prenos sproži prevzem.
6. **SC-001:** primerjaj kontrolno vsoto prevzete datoteke z izvorno → morata biti enaki.

## 5. Brez gesla ne gre (US2)

Vse spodaj v anonimnem oknu:

1. Odpri povezavo in klikni prenos brez gesla → prenosa ni.
2. Vpiši napačno geslo → zavrnjeno; sporočilo ne pove, ali je bilo blizu.
3. Naloži DRUGO datoteko in poskusi njeno geslo na prvi povezavi → zavrnjeno enako kot
   napačno geslo (FR-016).
4. Poskusi napačno geslo tolikokrat, kolikor je `FILE_SHARE_ATTEMPT_LIMIT`, in še enkrat.
   → `429`, in **tudi pravilno geslo je zdaj zavrnjeno** do izteka zaklepa (FR-030).
5. V zavihku lastnika odpri to datoteko → vidiš število zgrešenih poskusov in do kdaj je
   zaklenjena (FR-033).
6. Preveri dnevnik strežnika:

   ```bash
   docker compose logs api | grep fileShare
   ```

   → zgrešeni poskusi so zabeleženi s časom, povezavo in naslovom, **poskušenega gesla pa
   nikjer ni** (FR-032).
7. Spremeni en znak v naslovu povezave → isto sporočilo kot za potekli in preklicani
   primer (FR-023).

## 6. Upravljanje (US3)

1. **Preklic:** prekliči povezavo, nato jo v anonimnem oknu odpri → ne velja več. Če si bil
   pred preklicem že odklenjen, tudi ta prenos ne gre več (FR-026).
2. **Preklic med prenosom:** začni prenos 500 MB datoteke in med tem prekliči povezavo
   → prenos se prekine, prejemnik ima nepopolno datoteko (FR-041, research.md §22).
3. **Novo geslo:** izdaj novo geslo → dobiš NOVO povezavo in NOVO geslo; stara povezava od
   zdaj odgovarja kot neznana (FR-015). Vmesnik izrecno pove, da je treba poslati oboje.
4. **Brisanje:** izbriši datoteko in preveri disk:

   ```bash
   docker compose exec api find /app/data/files -type f
   ```

   → datoteke ni več (FR-045).
5. **Tuja datoteka:** z drugim računom poskusi `GET /api/v1/files/{tuj-id}` → `404`, ne
   `403` (FR-053).

## 7. Rok in čiščenje (US4)

1. Naloži datoteko z rokom 1 dan; v bazi ročno prestavi `expiresAt` v preteklost:

   ```bash
   docker compose exec mongo mongosh cleverdash --quiet --eval \
     'db.sharedfiles.updateOne({}, {$set:{expiresAt:new Date(Date.now()-8*864e5)}})'
   ```

2. Odpri povezavo → ne velja več; na lastnikovem seznamu je označena kot potekla.
3. Zaustavi API za nekaj minut, nato zaženi:

   ```bash
   docker compose stop api && docker compose start api
   docker compose logs api | grep fileShare.cleanup
   ```

   → pometač ob zagonu pobere zaostanek (FR-044); datoteke ni več na disku.
4. **Osirotela vsebina:** ročno odloži datoteko v `blobs/` brez zapisa in ji nastavi čas
   spremembe pred več kot 24 urami → naslednji zagon pometača jo odstrani.
5. **Zapis brez vsebine:** izbriši datoteko z diska, zapis pusti → na seznamu se pojavi kot
   pokvarjena, prevzem vrne napako z razlogom, NE prazne datoteke (FR-051, SC-011).

## 8. Prekinjeno nalaganje (Edge case)

1. Začni nalagati 500 MB in po nekaj sekundah zapri zavihek.
2. Preveri disk:

   ```bash
   docker compose exec api ls -la /app/data/files/tmp
   ```

   → `.part` datoteka je bila odstranjena takoj ob prekinitvi; če je ostala, jo pobere
   pometač po `FILE_SHARE_UPLOAD_TIMEOUT_MINUTES`.
3. Na lastnikovem seznamu se prekinjeno nalaganje NE pojavi (FR-006).
4. **SC-008:** primerjaj zasedeni prostor pred in po naboru prekinitev → mora biti enak.

## 9. Meje in kvota

1. Poskusi naložiti datoteko, večjo od `FILE_SHARE_MAX_MB` → zavrnjeno s sporočilom, kolikšna
   je meja; na disku ne ostane nič.
2. **Lažna napoved velikosti** — pošlji manjši `byteSize`, kot je dejansko telo:

   ```bash
   curl -X POST https://app.si/api/v1/files -H "X-API-Key: $KEY" \
     -H 'Content-Type: application/json' \
     -d '{"fileName":"lazna.bin","byteSize":1024}'
   # nato v vrnjeni uploadUrl pošlji 600 MB
   curl -X PUT "https://app.si/api/v1/files/$ID/content" -H "X-API-Key: $KEY" \
     -H 'Content-Type: application/octet-stream' --data-binary @velika.bin
   ```

   → prekinjeno MED prenosom s `413`, ne šele na koncu (FR-003).
3. Naloži toliko datotek, da presežeš `FILE_SHARE_QUOTA_MB` → `507` s podatkom, koliko
   prostora je na voljo.
4. Poskusi naložiti prazno datoteko (0 bajtov) → zavrnjeno (FR-008).

## 10. Brez vmesnika (US6, člen III)

Z API ključem z obsegoma `file-sharing:read` in `file-sharing:write`:

```bash
# 1. napovej
curl -X POST https://app.si/api/v1/files \
  -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 11111111-1111-1111-1111-111111111111' \
  -d '{"fileName":"porocilo.pdf","byteSize":204800,"expiresInDays":7}'

# 2. naloži vsebino
curl -X PUT "https://app.si/api/v1/files/$ID/content" \
  -H "X-API-Key: $KEY" -H 'Content-Type: application/octet-stream' \
  --data-binary @porocilo.pdf
# → odgovor vsebuje shareUrl in password

# 3. ponovi korak 1 z ISTIM Idempotency-Key → isti odgovor, brez drugega zapisa
```

**Preveri tudi izjemo (člen III):** pošlji `Idempotency-Key` na
`POST /api/v1/share/{token}/unlock` → glava nima učinka; prekliči povezavo in ponovi klic z
istim ključem → dovolilnice NE dobiš. Shranjen odgovor ne sme preživeti preklica
(research.md §10).

## 11. Javnost je res javnost — in nič več

1. **Brez žetona:** `curl https://app.si/api/v1/share/$TOKEN` → `200`, brez `Authorization`
   glave.
2. **Vsak lastnikov endpoint brez žetona:** `curl https://app.si/api/v1/files` → `401`.
3. **Lastnik odpre svojo povezavo prijavljen v istem brskalniku** → prevzem se obnaša enako
   kot za tujca; geslo je še vedno potrebno (FR-024).
4. **Potekla seja ne sme pokvariti javne strani:** v anonimnem oknu z veljavno povezavo,
   potem ko je bila seja odjavljena, prevzem deluje naprej.

## 12. Kaj mora biti čisto na koncu

```bash
npm run typecheck
npm run lint
npm test
# Pogodbo preveri generator tipov — nerazrešljiva pogodba tu pade, ne šele v produkciji.
npm run generate:contracts
```

In test izolacije zavihka (`apps/api/tests/integration/tab-isolation.spec.ts`): en vnos v
`TAB_REGISTRY` mora zadoščati, da se zavihek pojavi — brez sprememb resolverja, menija ali
spodnje vrstice (SC-005 iz 001).
