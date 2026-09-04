// Člen IX (razširjen duh): čista funkcija. FR-035, quickstart.md §4 primer 9.
// Preslika podan vrstni red ID-jev v `{ id, order }` pare (order = položaj v seznamu).
// Kamere, ki niso v `cameraIds` (druga skupina), se sploh ne pojavijo v izhodu — router
// (PUT /cameras/order) posodobi v bazi samo vrnjene ID-je, zato ostanejo nedotaknjene.

export interface OrderAssignment {
  id: string;
  order: number;
}

export function toOrderAssignments(cameraIds: readonly string[]): OrderAssignment[] {
  return cameraIds.map((id, order) => ({ id, order }));
}
