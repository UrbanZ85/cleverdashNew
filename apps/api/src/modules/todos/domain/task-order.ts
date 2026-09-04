// Čista domenska plast (člen IX). Vrstni red opravil za prikaz in izračun položajev.
//
// Zakaj `toOrderAssignments` (src/domain/camera-order.ts) TU ni ponovno uporabljen, čeprav je
// načrt to sprva predvideval: ta vrne zgoščene indekse (`{ id, order: 0,1,2 }`), ta modul pa
// potrebuje REDKE položaje s korakom `POSITION_STEP`. Ovijanje tuje funkcije, ki bi ji bilo
// treba izhod takoj preslikati, je daljše in manj berljivo od dveh vrstic tukaj — in vezalo bi
// opravila na pomočnika, poimenovanega po kamerah. Ista zamisel, druga oblika.

/**
 * Razmik med sosednjima položajema.
 *
 * Redki položaji pomenijo, da vrivanje med dve sosednji opravili nikoli ne zahteva prepisa
 * repa seznama. Pri deljenem seznamu je vsak dodaten prepis dodatna priložnost za trk z
 * nekom, ki v istem trenutku ureja isti seznam.
 */
export const POSITION_STEP = 1000;

interface OrderableTask {
  _id: unknown;
  done: boolean;
  position: number;
  doneAt: Date | null;
}

/**
 * Vrstni red za PRIKAZ: neodkljukana po ročnem položaju, nato odkljukana po času odkljukanja
 * padajoče (nazadnje odkljukano na vrhu svoje skupine).
 *
 * Računa se ob branju in se NE hrani: odvisen je od `done`, ki se spremeni brez `$push`, zato
 * bi `$push: { $sort: ... }` ustvaril samo videz urejenega polja, ki ga prvo odkljukanje tiho
 * razveljavi (data-model.md).
 *
 * Zadnja razsodba po `_id` ni okrasje. Dve hkratni dodajanji lahko izračunata ENAK `position`
 * (položaj je namig, ne enolični ključ — FR-026); brez razsodbe bi bil vrstni red med dvema
 * izrisoma odvisen od tega, v kakšnem zaporedju je Mongo vrnil elemente polja, in bi se
 * uporabniku pred očmi premetaval. ObjectId narašča s časom nastanka, zato je razsodba tudi
 * smiselna, ne le stabilna.
 */
export function orderTasks<T extends OrderableTask>(tasks: readonly T[]): T[] {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;

    if (a.done) {
      const at = a.doneAt ? a.doneAt.getTime() : 0;
      const bt = b.doneAt ? b.doneAt.getTime() : 0;
      if (at !== bt) return bt - at;
    } else if (a.position !== b.position) {
      return a.position - b.position;
    }

    const ai = String(a._id);
    const bi = String(b._id);
    return ai < bi ? -1 : ai > bi ? 1 : 0;
  });
}

/**
 * Položaji za `count` novih opravil na koncu seznama.
 *
 * Izhaja iz NAJVEČJEGA obstoječega položaja in ne iz dolžine polja: po čiščenju opravljenih
 * je dolžina manjša od največjega položaja, zato bi nova opravila pristala med starimi.
 */
export function nextPositions(existing: readonly { position: number }[], count: number): number[] {
  const max = existing.reduce((m, t) => (t.position > m ? t.position : m), 0);
  return Array.from({ length: count }, (_, i) => max + (i + 1) * POSITION_STEP);
}

export interface PositionAssignment {
  id: string;
  position: number;
}

/**
 * Podan vrstni red identifikatorjev v pare `{ id, position }`.
 *
 * Opravila, ki jih v `taskIds` ni (odkljukana, ali pa jih je nekdo dodal med tem, ko je
 * uporabnik urejal), se v izhodu sploh ne pojavijo — zapis posodobi samo naštete, zato ostanejo
 * nedotaknjena in se ne izgubijo (FR-026, enak dogovor kot pri `PUT /cameras/order`).
 */
export function toPositionAssignments(taskIds: readonly string[]): PositionAssignment[] {
  return taskIds.map((id, i) => ({ id, position: (i + 1) * POSITION_STEP }));
}
