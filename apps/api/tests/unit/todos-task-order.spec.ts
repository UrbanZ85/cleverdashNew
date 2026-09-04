import { describe, expect, it } from 'vitest';
import {
  POSITION_STEP,
  nextPositions,
  orderTasks,
  toPositionAssignments,
} from '../../src/modules/todos/domain/task-order.js';

// FR-021, FR-022, FR-025, FR-026. Najpomembnejši test v tej datoteki je STABILNOST vrstnega
// reda ob podvojenem položaju: položaj je namig in ne enolični ključ, zato se podvojitev
// lahko zgodi (dve hkratni dodajanji) in NE SME povzročiti, da se vrstni red med dvema
// izrisoma premetava.

const task = (
  id: string,
  position: number,
  done = false,
  doneAt: Date | null = null,
) => ({ _id: id, position, done, doneAt });

describe('orderTasks', () => {
  it('neodkljukana gredo pred odkljukana (FR-021)', () => {
    const out = orderTasks([
      task('a', 1000, true, new Date('2026-06-15T10:00:00Z')),
      task('b', 2000),
    ]);
    expect(out.map((t) => t._id)).toEqual(['b', 'a']);
  });

  it('neodkljukana po ročnem položaju naraščajoče', () => {
    const out = orderTasks([task('c', 3000), task('a', 1000), task('b', 2000)]);
    expect(out.map((t) => t._id)).toEqual(['a', 'b', 'c']);
  });

  it('odkljukana po času odkljukanja padajoče — nazadnje odkljukano na vrhu (FR-022)', () => {
    const out = orderTasks([
      task('staro', 1000, true, new Date('2026-06-15T08:00:00Z')),
      task('novo', 2000, true, new Date('2026-06-15T12:00:00Z')),
    ]);
    expect(out.map((t) => t._id)).toEqual(['novo', 'staro']);
  });

  it('položaj odkljukanih NE vpliva na njihov vrstni red — po odkljukanju nima pomena', () => {
    const out = orderTasks([
      task('prvi-po-polozaju', 1000, true, new Date('2026-06-15T08:00:00Z')),
      task('drugi-po-polozaju', 9000, true, new Date('2026-06-15T12:00:00Z')),
    ]);
    expect(out[0]?._id).toBe('drugi-po-polozaju');
  });

  it('PODVOJEN položaj ne zlomi ničesar in vrstni red je STABILEN med klici (FR-026)', () => {
    // Dve hkratni dodajanji lahko izračunata enak položaj. Brez razsodbe po `_id` bi bil
    // vrstni red odvisen od tega, kako je Mongo vrnil elemente polja, in bi se uporabniku
    // pred očmi premetaval.
    const vhod = [task('bbb', 2000), task('aaa', 2000), task('ccc', 1000)];
    const prvi = orderTasks(vhod).map((t) => t._id);
    const drugi = orderTasks([...vhod].reverse()).map((t) => t._id);
    expect(prvi).toEqual(drugi);
    expect(prvi).toEqual(['ccc', 'aaa', 'bbb']);
  });

  it('odkljukana z enakim doneAt sta prav tako stabilna', () => {
    const t = new Date('2026-06-15T10:00:00Z');
    const vhod = [task('bbb', 1000, true, t), task('aaa', 2000, true, t)];
    expect(orderTasks(vhod).map((x) => x._id)).toEqual(
      orderTasks([...vhod].reverse()).map((x) => x._id),
    );
  });

  it('odkljukano brez doneAt se ne izgubi in ne vrže', () => {
    const out = orderTasks([task('brez', 1000, true, null), task('odprto', 2000)]);
    expect(out.map((t) => t._id)).toEqual(['odprto', 'brez']);
  });

  it('vhodnega polja ne spremeni', () => {
    const vhod = [task('b', 2000), task('a', 1000)];
    orderTasks(vhod);
    expect(vhod.map((t) => t._id)).toEqual(['b', 'a']);
  });
});

describe('nextPositions', () => {
  it('na praznem seznamu začne pri enem koraku', () => {
    expect(nextPositions([], 1)).toEqual([POSITION_STEP]);
  });

  it('tri nova opravila dobijo tri zaporedne korake', () => {
    expect(nextPositions([{ position: 1000 }], 3)).toEqual([2000, 3000, 4000]);
  });

  it('izhaja iz NAJVEČJEGA položaja, ne iz dolžine polja', () => {
    // Po čiščenju opravljenih je dolžina manjša od največjega položaja; izhajanje iz dolžine
    // bi novo opravilo postavilo med stara.
    expect(nextPositions([{ position: 7000 }], 1)).toEqual([8000]);
  });

  it('negativnih ali ničelnih položajev ne potegne navzdol', () => {
    expect(nextPositions([{ position: -5 }], 1)).toEqual([POSITION_STEP]);
  });
});

describe('toPositionAssignments', () => {
  it('preslika vrstni red v redke položaje', () => {
    expect(toPositionAssignments(['a', 'b', 'c'])).toEqual([
      { id: 'a', position: 1000 },
      { id: 'b', position: 2000 },
      { id: 'c', position: 3000 },
    ]);
  });

  it('je idempotenten: ista vhodna zaporedja dajo iste položaje (FR-095)', () => {
    expect(toPositionAssignments(['a', 'b'])).toEqual(toPositionAssignments(['a', 'b']));
  });

  it('prazen seznam da prazen rezultat — zapis se ne izvede', () => {
    expect(toPositionAssignments([])).toEqual([]);
  });
});
