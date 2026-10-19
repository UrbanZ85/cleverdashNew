# Specification Quality Checklist: Iskalnik letalskih ponudb (Leti)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-17
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

Tri mesta so videti kot izjema od pravila "brez izvedbe" in so namerna:

1. **Imena virov podatkov (Travelpayouts/Aviasales, Ryanair, Wizz Air, easyJet) v FR-019 do
   FR-021.** Kateri vir se uporablja, je domenska odločitev lastnika namestitve z neposrednimi
   posledicami za uporabnika (starost podatka do 48 ur, neuradni vir privzeto izklopljen,
   zaščiteni viri izključeni po členu XII) — isti precedens kot Neverin v 011. Tehnologija
   dostopa ni navedena.
2. **Cona `Europe/Ljubljana` in izraz urnika (FR-046, FR-047).** Člen V.4 določa cono kot
   domensko; izraz urnika je nekaj, kar administrator vidi in vpiše, torej lastnost vmesnika in
   ne izvedbe.
3. **FR-057 in FR-058 (pogodba, ključ idempotentnosti, okolje za skrivnosti).** Zahtevi ustave
   (člena III in IV), ne izbiri izvedbe.

Odločitve, sprejete z lastnikom pred pisanjem (17. 10. 2026) in vgrajene brez oznak
[NEEDS CLARIFICATION], so naštete v razdelku Assumptions. Edina odprta negotovost — pokritost
vira za manjša letališča — ni vprašanje za naročnika, ampak meritev, ki jo načrt predvidi pred
fazo virov; specifikacija zahteva samo, da je slaba pokritost vidna, ne skrita (FR-017, FR-019).

Imena entitet v oklepajih (FlightSearchRule …) so iz naročila in so konceptualna, ne imena tabel;
načrt jih sme preimenovati.
