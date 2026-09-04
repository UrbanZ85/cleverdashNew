# Specification Quality Checklist: Opravila

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-03
**Feature**: [spec.md](../spec.md)

## Content Quality

- [X] No implementation details (languages, frameworks, APIs) — *z zavestnim hišnim odstopanjem, glej Notes*
- [X] Focused on user value and business needs
- [X] Written for non-technical stakeholders
- [X] All mandatory sections completed

## Requirement Completeness

- [X] No [NEEDS CLARIFICATION] markers remain
- [X] Requirements are testable and unambiguous
- [X] Success criteria are measurable
- [X] Success criteria are technology-agnostic — *z istim hišnim odstopanjem*
- [X] All acceptance scenarios are defined
- [X] Edge cases are identified
- [X] Scope is clearly bounded
- [X] Dependencies and assumptions identified

## Feature Readiness

- [X] All functional requirements have clear acceptance criteria
- [X] User scenarios cover primary flows
- [X] Feature meets measurable outcomes defined in Success Criteria
- [X] No implementation details leak into specification

## Notes

Vseh 16 točk je izpolnjenih. Dve sta izpolnjeni **z zavestnim odstopanjem od privzete
razlage**, ki ga je treba prebrati, ne spregledati:

### 1. "Brez implementacijskih podrobnosti" in razdelka `API in obsegi` / `Zavihek`

Spec vsebuje razdelka `#### API in obsegi` (FR-090 do FR-097) in `#### Zavihek` (FR-100 do
FR-105), ki omenjata endpointe, obsege pravic, `Idempotency-Key` in register zavihkov.
Privzeta razlaga te točke bi jih štela za implementacijo.

V tem projektu **niso**, in to zaradi ustave, ne zaradi navade:

- **Člen III** pravi, da je OpenAPI pogodba *sama* pogodba in da vsaka funkcija **MORA**
  obstajati kot endpoint, **preden** obstaja kot zaslon; avtomatizacija (n8n) je
  prvorazreden odjemalec, ne posledica. Zahteva "to je dosegljivo tudi brez vmesnika" je
  torej uporabniška zahteva enega od uporabnikov, ne tehnična podrobnost.
- **Člen I** pravi, da je odstranitev zavihka izbris ene mape in enega vnosa v registru.
  FR-105 je zato preverljiva lastnost izdelka (SC-009), ne opis kode.
- **Precedens**: vse funkcionalnosti 001–009 imajo v `spec.md` iste razdelke. 009 ima
  `#### API in obsegi` (FR-060 do FR-063) in `#### Zavihek` (FR-070 do FR-074) na natanko
  istem mestu.

Isti razlog velja za SC-008 (`Idempotency-Key`) in SC-009 (`typecheck`, `lint`): oboje sta
merili, ki ju ustava postavlja kot **kakovostna vrata**, in oboje je merljivo brez poznavanja
izvedbe.

### 2. Omemba lastnosti baze v razdelku Assumptions

Assumptions vsebuje trditev, da baza teče kot samostojen strežnik in transakcij nad več
dokumenti ni. To je res tehnično dejstvo — zapisano je zavestno in namenoma:

- Ni **zahteva** in ni **odločitev o izvedbi**; je **omejitev okolja**, ki jo je načrt dolžan
  upoštevati, in preverjeno dejstvo o tej namestitvi.
- Brez nje bi bila najbolj verjetna izvedba (opravila kot svoja zbirka) tiho napačna: FR-025
  in FR-027 zahtevata preurejanje in hkratne spremembe, ki brez transakcij v ločeni zbirki
  niso izvedljive atomarno. Zahteva, katere edina izvedljiva pot je znana in nezapisana, je
  past za tistega, ki jo bo izvajal.
- Assumptions je po predlogi pravo mesto za odvisnosti od obstoječega okolja.

### Kar ta spec zavestno **ne** vsebuje

- **Nobenega markerja [NEEDS CLARIFICATION].** Vseh osem odprtih vprašanj (stopnje pravic,
  pomen zaklepa, polja naloge, vir uporabnikov, e-pošta, obveščanje, postavitev strani,
  vedenje ploščice) je bilo razrešenih z naročnikom pred pisanjem in je zapisanih v
  Assumptions oziroma v ustreznih FR.
- **Nobene zahteve o potisnih obvestilih.** Prvotna odločitev je bila push; med raziskavo se
  je pokazalo, da v tej namestitvi ne more delovati (dve merljivi napaki, obe navedeni v
  Assumptions in `Out of Scope`). Zahteva je bila zato **spremenjena z naročnikom**, ne tiho
  opuščena — FR-007 in FR-103 sta nadomestilo.

### Pripravljenost na naslednjo fazo

Spec je pripravljen za `/speckit-plan`. `/speckit-clarify` ni potreben — odprtih vprašanj ni.

Za načrt so **zavezujoči** trije vhodi iz tega speca, ki jih ni mogoče izpolniti naknadno:
FR-026 in FR-027 (vrstni red je namig, hkratni spremembi obstaneta), FR-050 skupaj s FR-051 in
FR-063 (tri različna stanja zavrnitve so tri različna sporočila) in odstavek o kakovostnih
vratih 2 v Assumptions, ki ga je treba prepisati v `plan.md`.
