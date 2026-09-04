# Specification Quality Checklist: Zavihek kamer

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-21
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

### Razrešeno 21. 8. 2026 — vprašanja, predstavljena uporabniku

Vhodni dokument (`nacrt/003-cameras/spec.md`) je imel pet odprtih vprašanj, od katerih sta
bili prvi dve po njegovih lastnih besedah pomembni za `/speckit-plan`. Vsa so bila
predstavljena uporabniku (glej `## Clarifications` v spec.md), ker gre za odločitve o
obsegu, ki neposredno vplivajo na velikost in arhitekturo funkcionalnosti:

1. **Katere kamere/viri naj bodo v obsegu?** → Samo javni spletni viri, brez lastnega
   domačega omrežja. Odločilno za obseg: RTSP v domačem omrežju bi zahteval ločeno
   komponento znotraj tega omrežja (VPS ni v istem omrežju) — bistveno večji obseg.
2. **Kaj sta `toWorkUrl`/`fromWorkUrl`?** → Niso kamere; predlagano kot morebitni dashboard
   ploščici (001), izven obsega te funkcionalnosti.
3. **Ali naj bodo ARSO spletne kamere ponujen vir?** → Da, kot predloga pri dodajanju
   (FR-037).
4. **Ali je potrebno snemanje/zgodovina?** → Ne, samo pogled v živo.

### Dodatna zahteva uporabnika — zaslon za urejanje

Uporabnik je poleg razrešitve odprtih vprašanj izrecno zahteval, da zavihek dobi lasten
urejevalni zaslon: dodajanje, urejanje in brisanje kamer, vključno s kamerami, ki prikazujejo
vdelano vsebino/podatke z drugih strani (embed). Vhodni dokument je dodajanje brez posega v
kodo že predvidel (Z3, prvotni FR-030), ni pa ga formaliziral kot lasten blok zahtev niti ni
izrecno naslovil urejanja ali brisanja. Zato je dodan nov blok "Urejanje" (FR-030–FR-038, nova
User Story 4/P4), ki:

- formalizira dodajanje (FR-031, iz Z3),
- prvič formalizira urejanje (FR-032) in brisanje s potrditvijo (FR-033) obstoječe kamere,
- naredi vdelavo tuje strani (iframe/embed) prva-razredno možnost v obrazcu, ne le tehnično
  podrobnost API-ja (FR-036) — to je neposreden odziv na besede "podatke embedane iz drugih
  strani",
- vgradi ARSO webcam kot predlogo pri dodajanju (FR-037, odziv na vprašanje 3 zgoraj).

Prvotni API blok vhodnega dokumenta (FR-030 seznam/dodajanje/urejanje/brisanje/vrstni red,
FR-031 snapshot endpoint, FR-032 health endpoint) je zato preštevilčen na FR-040–FR-042, da
je prostor za nov blok "Urejanje" na FR-030–FR-038, brez podvojene numeracije.

### Sledljivost

Uporabniške zgodbe Z1–Z6 iz vhodnega dokumenta so preslikane, z eno vrinjeno novo zgodbo za
urejanje/brisanje: Z1→P1, Z2→P2, Z3→P3, nova zgodba (urejanje/brisanje)→P4, Z4→P5, Z5→P6,
Z6→P7. Vrinjena zgodba je namenoma takoj za Z3 (dodajanje), ker je neposredna dopolnitev
istega zaslona, ne ločena zmogljivost.

Številčenje FR-001–FR-005 (model), FR-010–FR-015 (prikaz) in FR-020–FR-024 (dostop do
virov) je nespremenjeno prevzeto iz vhodnega dokumenta. FR-030–FR-038 je nov blok
"Urejanje". FR-040–FR-042 je prvotni API blok vhodnega dokumenta (bil FR-030–FR-032),
preštevilčen zaradi vrinjenega bloka.

### Opomba k "No implementation details"

Omejitve v Dostop do virov (FR-020–FR-024) in sklici na proxy/predpomnilnik so obratovalne
zahteve, podedovane iz ustave (člen VIII — vljudnost do zunanjih virov) in iz narave zunanjih
virov (mešana vsebina, dovoljeni gostitelji), ne izbira orodja — ostajajo na ravni izida
("vir gre prek proxyja"), konkretna implementacija (knjižnica, predpomnilniška plast) pride v
`/speckit-plan` in `research.md`.

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`
