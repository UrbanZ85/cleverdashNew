# Specification Quality Checklist: Administratorska analitika

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-17
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

Prvi zapis specifikacije je na treh mestih imenoval izvedbo (poti do datotek v zaledju, ime
polja za okvarjeno stanje, "nastavljivo v okolju"). Vsa tri so bila pred zaključkom prepisana v
domensko besedišče — vzorec specifikacij 001–013 v tem projektu izvedbe v `spec.md` ne navaja.

Dve mesti sta videti kot izjema in sta namerni:

1. **FR-042 in FR-043 govorita o pogodbi in o ključu idempotentnosti.** Člen III ustave to
   zahteva od vsake funkcionalnosti; gre za zahtevo projekta, ne za izbiro izvedbe. Imeni
   tehnologij sta izpuščeni, zahteva pa ne.
2. **Cona `Europe/Ljubljana` v FR-028.** Člen V.4 pravi, da je to edina domenska cona; koledarski
   dan je zato domenski podatek in ne implementacijska podrobnost.

Tri odločitve so bile sprejete pred pisanjem specifikacije in so vanjo vgrajene, zato zanje ni
oznake [NEEDS CLARIFICATION]:

- **Zrnatost telemetrije:** dnevni števci po zavihku, ne dnevnik posameznih ogledov (FR-023,
  FR-024). Izbrana je bila najmanjša oblika, ki na vprašanje odgovori.
- **Kje admin to vidi:** samostojen zavihek z obsegom `admin`, ki ga drugi v meniju nimajo
  (FR-001). Osebni pogled na lastno porabo za navadnega uporabnika je izrecno izven obsega.
- **Postopek:** funkcionalnost gre skozi isti tok kot 001–013 (specifikacija → načrt → naloge →
  izvedba), zato ta datoteka obstaja pred `plan.md`.

Eno mesto bo treba razrešiti v načrtu in ni vprašanje za naročnika, ker je odgovor izvedbeni:
**kako se izmeri prostor pomanjšav slik receptov** (FR-006 jih izrecno vključuje, zabeležene
velikosti pa zanje ni tako kot za izvirnik). Načrt mora povedati, ali se izmerijo ob branju ali
se velikost začne beležiti ob nalaganju; specifikacija zahteva samo, da v izmeri niso izpuščene.
