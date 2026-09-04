# Specification Quality Checklist: Deljenje datotek

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-02
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

Štiri mesta so videti kot izjema od "brez implementacijskih podrobnosti" in so namerna; vsa
sledijo ustavi in vzorcu specifikacij 001–008 v tem projektu:

1. **FR-060, FR-062 in FR-063 imenujejo OpenAPI 3.1, `Idempotency-Key` in API ključ.** Člen
   III ustave to zahteva od vsake funkcionalnosti; gre za zahtevo projekta, ne izbiro izvedbe.
   FR-062 hkrati uveljavi ozko izjemo iz istega člena (endpoint, ki izda dovolilnico, glave ne
   sprejme) in zahteva, da je izjema zapisana v pogodbi — člen III izrecno pravi, da je tiho
   nesprejemanje glave kršitev, ne uveljavitev izjeme.
2. **FR-004 govori o pomnilniku, FR-050 o trajnem nosilcu.** To nista izbiri izvedbe, ampak
   meji, znotraj katerih funkcionalnost sploh obstaja: vsebnik ima omejen pomnilnik, 500 MB pa
   je za sinhrono branje v pomnilnik prevelikih. Enako velja za nosilec — brez njega bi
   naložene datoteke izginile ob vsaki posodobitvi, kar bi razveljavilo celotno obljubo modula
   in kakovostna vrata, točka 4.
3. **FR-053 imenuje 404 namesto 403.** To je uveljavljen vzorec projekta (003, 007, 008) in je
   varnostna zahteva, ne slog: obstoj tujega zapisa ni podatek.
4. **SC-002 meri porabo pomnilnika strežnika.** Ni uporabniško merilo, a je edino merilo, ki
   dokaže, da 500 MB ne teče skozi pomnilnik. Isto vlogo ima v 008 SC-005, ki se meri v
   omrežnem dnevniku brskalnika.

Neodgovorjena vprašanja ne ostajajo. Štiri odločitve, ki bi sicer bile
[NEEDS CLARIFICATION], so bile sprejete pred pisanjem specifikacije in so zapisane v
`nacrt/009-file-sharing/spec.md` ("Odločitve ob prevzemu"): hramba na datotečnem sistemu z
novim nosilcem, geslo generira sistem (eno na datoteko, prikazano enkrat), rok veljavnosti z
ročnim preklicem, in zavihek na uporabnika.

Štiri nadaljnje odločitve so bile sprejete med pisanjem specifikacije, ker zanje obstaja
razumen privzetek, in so zapisane med predpostavkami: prejemnik pred vpisom gesla ne vidi
imena datoteke (vidi velikost in rok), novo geslo izda tudi nov naslov povezave, privzeti rok
je 7 dni, zavihek je privzeto izklopljen.

Odprta vprašanja izvedbe (ne specifikacije) so v vhodnem gradivu pod "Odprta vprašanja za
`/speckit-plan`" — oblika naslova povezave, način dokazovanja gesla, konkretne meje dušenja,
ravnanje ob razhajanju zapisa in vsebine, in kateri enotski testi nadomestijo primere iz
kakovostnih vrat.

**Za `/speckit-plan` posebej:** ta funkcionalnost prva uvede javno, neavtenticirano pot in
prvo dušenje zahtev v tem zaledju. Načrt MORA obravnavati oboje eksplicitno, ne kot pritiklino
nalaganja datotek.
