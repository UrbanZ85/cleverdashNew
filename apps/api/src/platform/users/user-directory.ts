// Čiste funkcije za predstavitev osebe v imeniku (člen IX): brez baze, brez strežnika.
//
// Živijo v platform/, ne v modulu opravil: imenik uporabnikov ni pojem opravil in mora
// preživeti odstranitev katerega koli modula (člen I, research.md §11).

const collator = new Intl.Collator('sl', { sensitivity: 'base' });

/** Razvrstitev po slovenski abecedi. Dvojiška primerjava postavi č, š in ž za z — v spustnem
 * seznamu imen je to videti kot napaka, ne kot vrstni red. */
export function compareSlovenian(a: string, b: string): number {
  return collator.compare(a, b);
}

/**
 * Začetnice za kroglico ob imenu: prva črka prvega in prva črka zadnjega dela imena.
 *
 * Izpeljano ob branju in NE shranjeno — sicer bi ob preimenovanju v Keycloaku ostala zamrznjena
 * stara vrednost.
 */
export function initialsOf(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter((p) => p.length > 0);
  if (parts.length === 0) return '';
  const first = [...(parts[0] ?? '')][0] ?? '';
  const last = parts.length > 1 ? ([...(parts[parts.length - 1] ?? '')][0] ?? '') : '';
  return (first + last).toLocaleUpperCase('sl');
}

/**
 * Zamaskirana e-pošta za razločevanje soimenjakov: `janez.novak@agenda.si` → `j…k@agenda.si`.
 *
 * ZAKAJ ne cel naslov (FR-072): navedena potreba je razločiti dva človeka z istim imenom.
 * Zamaskirana oblika to potrebo pokrije v celoti — domena in oblika sta tisto, kar loči
 * "Janez Novak (j…k@agenda.si)" od "Janez Novak (j…k@gmail.com)". Cel naslov bi isto potrebo
 * pokril in POVRHU vsakemu prijavljenemu uporabniku izročil uporaben seznam naslovov cele
 * namestitve. Osebni podatek, razkrit čez svoj namen, je razkritje brez namena.
 *
 * VEDNO zamaskirana, ne pogojno (npr. samo pri soimenjakih): pogojna prisotnost bi
 * avtomatizaciji dala polje, ki je včasih prazno iz razlogov, ki jih ne more predvideti, in bi
 * razkrila DEJSTVO, da soimenjak obstaja.
 *
 * Domena ostane cela: je last organizacije, ne osebe, in je tisto, kar loči službeni naslov od
 * zasebnega.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  // Brez `@` to ni naslov. Vrnemo prazen niz in NE izvirnika: neznana oblika je zadnje mesto,
  // kjer bi smeli ugibati in kaj spustiti skozi.
  if (at <= 0 || at === email.length - 1) return '';

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const chars = [...local];
  if (chars.length <= 1) return `${chars[0] ?? ''}…@${domain}`;
  return `${chars[0] ?? ''}…${chars[chars.length - 1] ?? ''}@${domain}`;
}
