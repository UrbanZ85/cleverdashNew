// Premikanje opravila gor in dol — SAMO na odjemalcu.
//
// Pogodba API-ja je NASTALI VRSTNI RED (`PUT /todos/lists/{id}/order` s celim `taskIds`), ne
// gib. Razlog je idempotentnost: ponovljen "premakni gor" bi opravilo premaknil dvakrat,
// ponovljen cel vrstni red pa je no-op — in člen III zahteva, da vsaka mutacija prenese
// ponovitev z istim `Idempotency-Key` (research.md §10).
//
// Posledica te odločitve je, da puščici gor/dol nista pojem strežnika. Živita tu, testirata se
// z webovim vitestom, in ko bi kdaj hoteli vlečenje in spuščanje, se API ne spremeni.

export type MoveDirection = 'up' | 'down';

/**
 * Nov vrstni red identifikatorjev po premiku enega opravila za eno mesto.
 *
 * Vrne NOVO polje; vhodnega ne spremeni. Neznan `taskId` ali premik čez rob vrneta vrstni red
 * nespremenjen — klicatelj tako ne potrebuje posebne veje, gumb pa je itak onemogočen
 * (`canMove`).
 */
export function moveByOne(
  taskIds: readonly string[],
  taskId: string,
  direction: MoveDirection,
): string[] {
  const index = taskIds.indexOf(taskId);
  if (index === -1) return [...taskIds];

  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= taskIds.length) return [...taskIds];

  const next = [...taskIds];
  const moved = next[index] as string;
  next[index] = next[target] as string;
  next[target] = moved;
  return next;
}

/** Ali je premik v to smer sploh mogoč — za onemogočenje gumba na robu seznama. */
export function canMove(
  taskIds: readonly string[],
  taskId: string,
  direction: MoveDirection,
): boolean {
  const index = taskIds.indexOf(taskId);
  if (index === -1) return false;
  return direction === 'up' ? index > 0 : index < taskIds.length - 1;
}
