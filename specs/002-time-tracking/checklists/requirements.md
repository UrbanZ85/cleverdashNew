# Specification Quality Checklist: Beleženje časa

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-20
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

### Razrešeno 20. 8. 2026 — specifikacija je pripravljena za `/speckit-plan`

**FR-007 je odgovorjen prek vprašanja uporabniku: privzeti način novoustvarjenega profila
je `AUTO`.** Vhodni dokument (`nacrt/002-time-tracking/spec.md`) je kot varnejšo možnost
predlagal `REMIND_ONLY`, ker se s tem avtomatizacija "vklopi zavestno". Uporabnik je
zavestno izbral `AUTO`, da profil deluje takoj brez dodatnega koraka. Odločitev ne
spreminja obveznih varoval (preverjanje pred izvedbo, verifikacija po izvedbi, ponovni
poskusi, `dry-run`) — te veljajo enako ne glede na privzeti način. Zapisano v FR-007 in
Assumptions.

To je bila edina postavka, predstavljena uporabniku kot vprašanje. Merilo je bilo vpliv na
varnost/obseg: to je edina odločitev iz vhodnega dokumenta, ki neposredno vpliva na to, ali
sistem privzeto sam pritiska gumbe na tuji strani brez izrecnega uporabnikovega dejanja.

### Razrešeno med pisanjem — brez vprašanja uporabniku

Vhodni dokument je imel šest odprtih vprašanj in eno dodatno vprašanje o obsegu v razdelku
"Kaj ni v obsegu". Pet od šestih je imelo v izvirniku napisan predlog, zato so sprejeta kot
odločena in zapisana v razdelku Assumptions, ne kot markerji:

1. **Strpno obdobje in ponovitve opozorila** → 10 minut, ponovitev vsakih 10 minut, največ
   trikrat (predlog vhodnega dokumenta, sprejet nespremenjen).
2. **Potrditveno obvestilo ob uspešni samodejni akciji** → privzeto samo prva in zadnja
   akcija dneva, nastavljivo po vrsti akcije (predlog vhodnega dokumenta, sprejet
   nespremenjen).
3. **Ravnanje ob pozabljenem "Konec dela" čez polnoč** → akcija se ob prehodu koledarskega
   dne zapre kot `missed` z obvestilom (predlog vhodnega dokumenta, sprejet nespremenjen;
   zapisano kot novo FR-045).
4. **E-pošta poleg potisnih obvestil** → ni del te funkcionalnosti; kanal ostajajo izključno
   potisna obvestila iz 001. Star sistem je pošiljal oboje, a podvajanje kanala brez jasne
   dodane vrednosti ni bilo sprejeto kot privzeta odločitev; e-pošta ostaja mogoča kasnejša
   razširitev.
5. **Samodejni preklop profila v `REMIND_ONLY` po zaporednih napakah** → sistem tega ne
   naredi samodejno; namesto tega pošlje posebno opozorilo po treh zaporednih neuspehih, da
   uporabnik sam presodi vzrok. Samodejni preklop bi lahko prikril pravi vzrok (npr. potekla
   seja) namesto da bi ga razkril.

Dve vprašanji brez zapisanega predloga sta bili razrešeni z utemeljitvijo, izpeljano iz že
sprejetih odločitev v 001, ne z ugibanjem:

6. **Ali bo kdaj več oseb s svojimi urniki (obseg)?** → Ne; sistem ostaja enouporabniški z
   več napravami, kot je odločeno v 001 (FR-016/FR-017). Več profilov je os znotraj ene
   osebe, ne podpora za organizacijo z več ljudmi.
7. **Ali je način nastavljiv na ravni posamezne akcije, ali zadošča raven profila
   (FR-005)?** → Zadošča raven profila. Vhodni dokument sam ni imel jasnega primera, kjer bi
   bila mešanica načinov znotraj enega profila (npr. prijava samodejno, konec dela le
   opozorilo) nujna za katero od uporabniških zgodb Z1–Z11; dodajanje te granularnosti brez
   jasne zahteve bi po nepotrebnem povečalo zapletenost podatkovnega modela. Če se med
   `/speckit-clarify` ali kasnejšo rabo izkaže drugače, je to enostavna razširitev FR-005,
   ne sprememba arhitekture.

### Opomba k "No implementation details"

Enako kot pri 001: zahteve o brskalniku, strani delodajalca in časovnem pasu
(Podedovane omejitve, FR-020–FR-022, FR-093) so obratovalne omejitve, podedovane iz
zunanjega sistema in ustave (členi V, IX, XI), ne izbira te specifikacije. Ostajajo na
ravni izida ("sistem zna prebrati stanje, ne da bi karkoli spremenil"), ne orodja (brez
imen knjižnic za brskalnik, čakalne vrste ali časovnega pasu — te pridejo v
`/speckit-plan` in `research.md`).

### Sledljivost

Številčenje FR-001 do FR-093 je namenoma v enaki skupinski shemi (po deseticah) kot v
`nacrt/002-time-tracking/spec.md`, z eno dodano zahtevo (FR-007, privzeti način) in eno
razdeljeno (FR-044 vhodnega dokumenta je postala FR-044 + nova FR-045 za polnočno zaprtje).

Uporabniške zgodbe Z1–Z11 iz vhodnega dokumenta so preslikane v P1–P11:
Z7→P1, Z1→P2, Z2→P3, Z3→P4, Z4→P5, Z5→P6, Z6→P7, Z8→P8, Z10→P9, Z9→P10, Z11→P11.
Prioriteta P1 je namenoma Z7 (ročni pritisk), ne Z1 (samodejni dan), ker je ročno preverjeno
branje in izvedba stanja skupni gradnik, na katerem stojita tako samodejni način (P2) kot
opozarjanje (P4) — enako načelo kot pri 001, kjer je P1 prijava, ne dashboard.

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`
