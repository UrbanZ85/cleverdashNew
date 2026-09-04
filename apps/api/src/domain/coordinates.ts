// docs/legacy-engine.md §3: koordinate niso zapisane kot števila, ampak z znakom "_" na
// mestu zadnje decimalke. Razrešitev v konkretno število je domenska odgovornost, ne
// portala — portal prejme že razrešeno lokacijo (`ResolvedLocation`).

/** Razreši npr. `"46.0629_6"` v konkretno število z naključno števko 0–9 na mestu `_`,
 * kar da vsaki registraciji nekoliko drugačno lokacijo znotraj približno 10 m. */
export function resolveCoordinate(template: string, randomFn: () => number = Math.random): number {
  const digit = Math.floor(randomFn() * 10);
  return Number(template.replace('_', String(digit)));
}
