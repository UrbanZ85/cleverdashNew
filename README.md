# CleverDash — načrt za Spec Kit

Ta mapa **je** novi projekt. Vanjo se inicializira Spec Kit in v njej nastane aplikacija.
Ničesar ni treba kopirati.

CleverDash je osebni dashboard z zavihki. Zavihek "Beleženje časa" je prenova obstoječe
aplikacije `belezenje_casa` (Ionic/Angular + Node + Mongo + Puppeteer).

**Stack:** Ionic + Angular (web in Android prek Capacitorja), Node.js + TypeScript,
MongoDB, Puppeteer, Docker Compose na VPS.

**Naslovi:** aplikacija na `https://app.si`, API na `https://app.si/api/v1/...` — isti
izvor, brez CORS-a. Reverse proxy usmeri `/api/*` na backend, vse ostalo na SPA.

---

## Zakaj se dokumenti ne imenujejo `specs/`

Mapi `specs/` in `.specify/` **si lasti Spec Kit**:

- `specify init` zapiše svoje predloge v `.specify/`, vključno z `.specify/memory/constitution.md`;
- `/speckit-specify` sam ustvari `specs/NNN-ime/spec.md`, številko pa določi tako, da
  pregleda obstoječe mape v `specs/`, vzame najvišjo in prišteje eno.

Če bi moji dokumenti ležali v `specs/001-…`, `002-…`, `003-…`, bi Spec Kit pri prvi
funkcionalnosti ustvaril `specs/004-…` in dobil bi dve vzporedni številčenji. Zato so
dokumenti v `nacrt/`, kjer Spec Kitu niso v napoto.

Ista logika velja za ustavo: `nacrt/constitution.md` je vhod, ki ga prebere
`/speckit-constitution`, ta pa nato zapiše svojo različico v `.specify/memory/`.

## Sorodne mape

| Mapa | Kaj je |
|---|---|
| `privat\cleverdash` | **ta projekt** |
| `privat\cleverdash-old` | starejši CleverDash (Angular 13 + Firebase, git repo, zadnji commit "audio + new cameras") |
| `privat\cleverdash2` | še en starejši poskus iz novembra 2025, z `cleverdash` in `cleverdash-be` |
| `privat\belezenje_casa` | aplikacija, ki jo zavihek "Beleženje časa" nadomešča |

`cleverdash-old` je koristen vir: njegov zaslon `pages/camera/` pokaže, kaj "pregled kamer"
v praksi pomeni, in je povzet v `nacrt/003-cameras/spec.md`. Preden ga arhiviraš, preglej
`docs/SECURITY-FIRST.md` — tudi v njem so ključi.

---

## Kaj je v paketu

| Datoteka | Namen | Kam v Spec Kit |
|---|---|---|
| `nacrt/constitution.md` | Nepogojna pravila za vse funkcionalnosti | `/speckit-constitution` |
| `nacrt/001-app-shell-dashboard/spec.md` | Ogrodje, meni, dashboard, vreme + ARSO radar | `/speckit-specify` (1) |
| `nacrt/002-time-tracking/spec.md` | **Beleženje časa — glavna funkcionalnost** | `/speckit-specify` (2) |
| `nacrt/002-time-tracking/plan.md` | Tehnični načrt; poglavje A je skupna arhitektura | `/speckit-plan` |
| `nacrt/002-time-tracking/research.md` | Tehnične odločitve, stanje ure, Puppeteer v Dockerju | vhod za `/speckit-plan` |
| `nacrt/002-time-tracking/data-model.md` | Mongo kolekcije, indeksi, prehodi stanj | vhod za `/speckit-plan` |
| `nacrt/002-time-tracking/contracts/openapi.yaml` | REST pogodba, 23 poti (tudi za n8n) | vhod za `/speckit-plan` |
| `nacrt/002-time-tracking/quickstart.md` | Docker, Caddy, VPS, prvi zagon | vhod za `/speckit-plan` |
| `nacrt/003-cameras/spec.md` | Zavihek kamer | `/speckit-specify` (3) |
| `docs/legacy-engine.md` | **Obratno inženirstvo obstoječega engine-a + napake, ki jih ne ponovimo** | referenca |
| `docs/env-reference.md` | Vse okoljske spremenljivke: kaj ostane, kaj gre v bazo, kaj je novo | referenca |
| `docs/SECURITY-FIRST.md` | **Razkrite skrivnosti, ki jih je treba zamenjati** | naredi takoj |

---

## Vrstni red uporabe

### Inicializacija — **opravljeno 19. 8. 2026**

```powershell
specify init --here --force --integration claude --script ps
```

Rezultat: `.claude/skills/speckit-*` (10 skillov), `.specify/` s predlogami in
PowerShell skripti. `nacrt/` in `docs/` sta ostala nedotaknjena — `--force` samo
dovoli inicializacijo v neprazno mapo in ničesar ne briše.

Kar še ni narejeno:

```powershell
git init
git add -A
git commit -m "nacrt in Spec Kit scaffold"
```

Splača se pred prvo funkcionalnostjo, ker Spec Kit dela vejo na funkcionalnost.
Razmisli tudi o `.claude/` v `.gitignore` — `specify` sam opozori, da agentske mape
lahko vsebujejo poverilnice.

### Če `specify` ni najden

Namestitev je **enkratna na uporabniški račun**, ne na projekt in ne na VSCode okno.
Binarji so v `%USERPROFILE%\.local\bin` in ta pot je v trajnem PATH.

Če ukaz vseeno ni najden, ima to okno VSCode **zastarel PATH** — odprto je bilo, preden
je bil `uv` namenščen. Integriran terminal podeduje PATH od procesa VSCode, zato nov
terminal ne pomaga; pomaga šele ponovni zagon VSCode. Zasilno v tekoči seji:

```powershell
$env:PATH = "$env:USERPROFILE\.local\bin;$env:PATH"
```

Če `uv` sploh manjka:
`powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`,
nato `uv tool install specify-cli --from git+https://github.com/github/spec-kit.git`.

### Naprej v Claude Code, en ukaz za drugim

```
/speckit-constitution   Preberi nacrt/constitution.md in iz tega naredi ustavo projekta.

# Feature 1 — ogrodje in dashboard
/speckit-specify        Preberi nacrt/001-app-shell-dashboard/spec.md in ustvari specifikacijo.
/speckit-clarify
/speckit-plan           Uporabi poglavje A ("Skupna arhitektura") iz
                        nacrt/002-time-tracking/plan.md in docs/env-reference.md.
/speckit-tasks
/speckit-implement

# Feature 2 — beleženje časa
/speckit-specify        Preberi nacrt/002-time-tracking/spec.md in ustvari specifikacijo.
/speckit-clarify        # razreši [NEEDS CLARIFICATION] oznake
/speckit-plan           Uporabi nacrt/002-time-tracking/{plan,research,data-model,quickstart}.md,
                        nacrt/002-time-tracking/contracts/openapi.yaml in docs/legacy-engine.md.
/speckit-analyze
/speckit-tasks
/speckit-implement

# Feature 3 — kamere
/speckit-specify        Preberi nacrt/003-cameras/spec.md in ustvari specifikacijo.
/speckit-clarify        # tu sta dve vprašanji, ki bistveno spremenita obseg
/speckit-plan
/speckit-tasks
/speckit-implement
```

Ukazi so **skills z vezajem**: `/speckit-specify`, ne `/speckit.specify` in ne `/specify`.
V dokumentaciji spec-kita na GitHubu so zapisani s piko (`/speckit.specify`), ker tam
opisujejo drugo obliko integracije. Pri `--integration claude` se namestijo kot skills v
`.claude/skills/`, torej velja oblika z vezajem — tista, ki jo izpiše `specify init`.

Vrstni red je pomemben: **001 mora biti prvi**, ker vzpostavi monorepo, avtentikacijo,
Docker in registar zavihkov, na katera se 002 in 003 samo priklopita.

Znotraj 002 velja ena omejitev: **faza 3 pred fazo 4** (`plan.md` §B.7). Klikanje se ne
vklopi, dokler branje stanja ni dokazano zanesljivo na živi strani.

---

## Kaj je bilo prebrano iz obstoječe kode

Paket ni napisan na pamet. Analizirano je bilo:

- `belezenje-casa-BE/src/repository/working-hours.ts` — Puppeteer engine
- `belezenje-casa-BE/src/services/scheduler.ts` — urnik in generiranje dnevnih akcij
- `belezenje-casa-BE/src/db-models/` — obstoječi model podatkov
- `belezenje-casa-BE/src/controller/` — obstoječi API
- `belezenje-casa/src/app/page/pages/` — zasloni Beleženje, Urnik, Zgodovina
- `cleverdash/src/app/pages/camera/` — obstoječi zaslon kamer
- `.env`, oba `docker-compose` fila, oba `Dockerfile`

Zunanji viri, preverjeni 19. 8. 2026: animirana radarska slika ARSO, ARSO JSON API za
vreme, ARSO XML rezerve, praznični API za Slovenijo, in dosegljivost kamer prek HTTPS.
Podrobnosti v `nacrt/001-app-shell-dashboard/spec.md` in `nacrt/002-time-tracking/research.md`.

Naslov e-računov **ni bil klican**, ker bi vsaka zahteva lahko vplivala na pravo evidenco
delovnega časa. Delovanje engine-a je razbrano iz kode.

---

## Tri stvari, ki jih je vredno vedeti pred branjem

**1. Seznam gumbov je stanje.** Stran e-računov ne pove, ali si na delu — pove samo, katere
gumbe lahko pritisneš. Iz tega nabora se izpelje stanje, in ta ena preslikava poganja
verifikacijo klika, zaznavo "nisi pritisnil" in varovalko pred napačnim klikom hkrati.
Glej `nacrt/002-time-tracking/research.md` §1.

**2. Stari scheduler ima štiri resne napake**, ki pojasnijo znane simptome: dnevni načrt se
ustvari samo v 10-sekundnem oknu ob polnoči, koledarski dan se računa po UTC namesto po
`Europe/Ljubljana`, preverjanje podvajanja ne upošteva profila (zato drugi profil tisti dan
odpade), in `ClickOnButton` vrne uspeh tudi takrat, ko gumba sploh ni bilo.
Glej `docs/legacy-engine.md` §4.

**3. "Včasih se ko se pritisne gumb nič ne zgodi"** ima verjetno dva vzroka, ki nista v
domenski logiki: privzeti `/dev/shm` v Dockerju je 64 MB, kar Chromiumu ne zadošča
(rešitev je `shm_size: 1gb` v composeu), in verifikacija v stari kodi bere DOM brez
ponovnega nalaganja strani, zato vidi stanje pred klikom.
Glej `nacrt/002-time-tracking/research.md` §2 in `docs/legacy-engine.md` §4.6.
