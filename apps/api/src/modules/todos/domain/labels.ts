// Čista domenska plast (člen IX). Slovenska sklanjatev za besedila, ki jih sestavi STREŽNIK.
//
// Zakaj to obstaja tudi na strežniku, ko ima odjemalec svojo različico (`todos.model.ts`):
// podnaslov zavihka v meniju sestavi strežnik (`platform/tabs/extension.ts`, `TabDetail`), ker
// ga odjemalec dobi kot gotov niz in ne kot število. Uvoz med `apps/api` in `apps/web` ni
// mogoč (ločena projekta, člen I) — to je ista, zavestno sprejeta podvojitev kot pri seznamu
// ikon v `apps/web/tests/unit/icons.spec.ts`.
//
// Ostanek po modulu 100 in ne po 10: 111 je "opravil", ne "opravilo".

export function pluralTasks(count: number): string {
  const rest = Math.abs(count) % 100;
  if (rest === 1) return 'opravilo';
  if (rest === 2) return 'opravili';
  if (rest === 3 || rest === 4) return 'opravila';
  return 'opravil';
}

/** "3 nedokončana opravila" — podnaslov zavihka v meniju (FR-103). */
export function pluralOpenTasks(count: number): string {
  const rest = Math.abs(count) % 100;
  const adjective =
    rest === 1 ? 'nedokončano' : rest === 2 ? 'nedokončani' : rest === 3 || rest === 4 ? 'nedokončana' : 'nedokončanih';
  return `${count} ${adjective} ${pluralTasks(count)}`;
}
