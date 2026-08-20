# Specification Quality Checklist: Ogrodje aplikacije in dashboard

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-19
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

### Razrešeno 19. 8. 2026 — specifikacija je pripravljena za `/speckit-plan`

**FR-016 je odgovorjen: sistem je enouporabniški.** Ena oseba z več napravami. Zapisi ne
nosijo oznake lastnika, upravljanja uporabnikov ni, nastavitve so globalne. Obsegi iz
FR-013 ločujejo človeka od avtomatizacije (n8n, člen III ustave), ne uporabnika od
uporabnika.

Iz tega odgovora sta sledili dve dopolnitvi, ki jih vhodni dokument ni imel:

- **FR-017** (nov): več hkratnih sej iste osebe na različnih napravah je podprtih; vsaka
  naprava ima svojo družino sej. Brez tega bi "ena oseba" pomenila tudi "ena naprava", kar
  ni namen — člen XI ustave predvideva web in Android hkrati.
- **Zapisano razlikovanje profil ≠ uporabnik.** Beleženje časa (002) ima več profilov za
  isto osebo; to je druga os kot uporabniki. Enouporabniškost torej ne odpravi zahteve po
  unikatnosti na (datum, profil, tip akcije) iz člena V.3 — prav opustitev profila v tem
  ključu je bila ena od štirih napak starega schedulerja.

Zavestno sprejeta cena: prehod na več oseb bi bil kasneje migracija vseh zapisov, ne vklop
zaslona. Zapisano v razdelku Assumptions, da odločitev ne izgubi konteksta.

### Razrešeno med pisanjem — brez vprašanja uporabniku

Vhodni dokument je imel štiri odprta vprašanja. Tri od njih so imela v izvirniku napisan
predlog, zato so sprejeta kot odločena in zapisana v razdelku Assumptions, ne kot markerji:

1. Privzeta lokacija za vreme → Ljubljana, z možnostjo izbire.
2. Kaj je na dashboardu poleg vremena in radarja → v tej fazi nič drugega, plus prazna
   mreža, ki sprejme nove ploščice.
3. Dashboard kot zavihek ali začetni zaslon → začetni zaslon nad zavihki, dosegljiv prek
   logotipa.

Če katerikoli od teh privzetkov ni prav, ga je treba popraviti zdaj, ker vpliva na
usmerjanje in postavitev.

### Opomba k "No implementation details"

Postavka je označena kot izpolnjena, a z zavestno mejo. Zahteve FR-040 do FR-044 in
FR-001 opisujejo obratovalne in varnostne omejitve, ki jih narekuje ustava (členi II, IV,
VII) in niso izbira te specifikacije. Zapisane so na ravni izida, ne orodja: "iz čiste
kopije zagonljiv brez ročnih korakov" namesto imena orodja za zaganjanje, "šifrirana
povezava se obnavlja samodejno" namesto imena izdajatelja potrdil. Konkretna orodja pridejo
v `/speckit-plan`.

Enako velja za razdelek Dependencies, kjer so navedeni preverjeni naslovi virov ARSO in
dva naslova, ki vračata 404. To je izsledek preverjanja z 19. 8. 2026 in sodi v
specifikacijo kot dejstvo o zunanji odvisnosti, ne kot navodilo za izvedbo.

### Sledljivost

Številčenje FR-001 do FR-044 je namenoma enako kot v `nacrt/001-app-shell-dashboard/spec.md`,
da je preslikava med vhodnim dokumentom in to specifikacijo enosmerna in preverljiva. FR-016
je edina nova zahteva; v vhodnem dokumentu je obstajala samo kot odprto vprašanje.

Uporabniške zgodbe Z1–Z6 iz vhodnega dokumenta so preslikane v P1–P7: Z4→P1, Z1→P2, Z2→P3,
Z5→P4, Z3→P5, Z6→P6. P7 (obvestila) je nova zgodba — vhodni dokument je obvestila imel samo
kot zahteve FR-030 do FR-034, brez zgodbe, čeprav so del obsega.

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`
