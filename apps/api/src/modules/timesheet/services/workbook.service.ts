import { fileURLToPath } from 'node:url';
import { access } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { minutesToDayFraction, timeDayFraction } from '../domain/schedule.js';
import type { ResolvedDay, ResolvedMonth, ResolvedWeekTotals } from '../domain/resolve-month.js';

// Prenos `src/edc/buildEdcWorkbook.ts` iz samostojne aplikacije. Ta datoteka je EDINI del
// modula, ki pozna ExcelJS in obliko predloge — vse odločanje o dnevih in urah je v
// `domain/` (člen IX). Konstante spodaj opisujejo predlogo `assets/edc-template.xlsx`; ob
// zamenjavi predloge se popravijo one, ne logika.

/** Izvirna predloga: podatkovni blok so vrstice 13–53 (41 vrstic), "skupaj" je v 54. */
const TEMPLATE_DATA_START = 13;
const TEMPLATE_DATA_ROWS = 41;
const TEMPLATE_SKUPAJ_ROW = 54;
const TEMPLATE_LAST_BODY_ROW = 53;
/** Noga za vrstico "skupaj" (vrstice 55–59 v izvirni predlogi). Vse čez to se izbriše. */
const TEMPLATE_FOOTER_ROWS = 5;

const COL_B = 2;
const COL_C = 3;
const COL_D = 4;
const COL_E = 5;
const COL_F = 6;
const COL_G = 7;
const COL_H = 8;
const COL_I = 9;
/** Stolpci odsotnosti v predlogi: M = letni dopust, N = praznik, O = bolniška. */
const COL_VACATION = 13;
const COL_HOLIDAY = 14;
const COL_SICK = 15;
const COL_LAST = 25;

/** Vrstice predloge, katerih oblikovanje se prekopira na novo zgrajene vrstice. */
const STYLE_SOURCE_ROWS = { work: 13, weekend: 18, pad: 47, sum: 20, spacer: 53 } as const;

/**
 * Predloga je sredstvo modula in potuje z njim. Pot se razreši iz `import.meta.url`, NE iz
 * `process.cwd()` kot v izvirni aplikaciji: delovna mapa je `apps/api` v razvoju in `/app` v
 * vsebniku, tako razrešena pot pa bi bila v enem od obeh napačna. `npm run build` sredstvo
 * prekopira v `dist/` (apps/api/scripts/copy-assets.mjs).
 */
export function templatePath(): string {
  return fileURLToPath(new URL('../assets/edc-template.xlsx', import.meta.url));
}

/** Člen VII: manjkajoča predloga mora povedati, katere datoteke ni, ne pa pasti globoko v ExcelJS. */
export async function assertTemplateReadable(): Promise<void> {
  const path = templatePath();
  try {
    await access(path);
  } catch {
    throw new Error(`Predloge evidence ni na ${path}.`);
  }
}

function deepClone<T>(o: T): T {
  return o == null ? o : (JSON.parse(JSON.stringify(o)) as T);
}

interface CellSnapshot {
  numFmt?: string;
  font?: Partial<ExcelJS.Font>;
  alignment?: Partial<ExcelJS.Alignment>;
  border?: Partial<ExcelJS.Borders>;
  fill?: ExcelJS.Fill;
}

interface RowSnapshot {
  height?: number;
  cells: Map<number, CellSnapshot>;
}

function snapshotRow(ws: ExcelJS.Worksheet, rowNumber: number): RowSnapshot {
  const row = ws.getRow(rowNumber);
  const cells = new Map<number, CellSnapshot>();
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cells.set(colNumber, {
      numFmt: cell.numFmt,
      font: cell.font ? deepClone(cell.font) : undefined,
      alignment: cell.alignment ? deepClone(cell.alignment) : undefined,
      border: cell.border ? deepClone(cell.border) : undefined,
      fill: cell.fill ? deepClone(cell.fill) : undefined,
    });
  });
  return { height: row.height, cells };
}

function applySnapshot(ws: ExcelJS.Worksheet, rowNumber: number, snap: RowSnapshot): void {
  const row = ws.getRow(rowNumber);
  if (snap.height != null) row.height = snap.height;
  for (const [col, meta] of snap.cells) {
    const cell = row.getCell(col);
    if (meta.font) cell.font = meta.font as ExcelJS.Font;
    if (meta.alignment) cell.alignment = meta.alignment as ExcelJS.Alignment;
    if (meta.border) cell.border = meta.border as ExcelJS.Borders;
    if (meta.fill) cell.fill = meta.fill;
    if (meta.numFmt) cell.numFmt = meta.numFmt;
  }
}

/** 1-osnovan indeks stolpca → Excelove črke (1 → A, 9 → I). */
function excelColumnLetter(col: number): string {
  let letters = '';
  let n = col;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function parseMergeRows(range: string): [number, number] {
  const [from, to] = range.split(':');
  const rowOf = (ref: string) => Number(/^([A-Z]+)(\d+)$/i.exec(ref)?.[2] ?? 0);
  const first = rowOf(from ?? '');
  const second = rowOf(to ?? '');
  return [Math.min(first, second), Math.max(first, second)];
}

function unmergeDataBlock(ws: ExcelJS.Worksheet): void {
  for (const range of [...(ws.model.merges ?? [])]) {
    const [top, bottom] = parseMergeRows(range);
    if (top >= TEMPLATE_DATA_START && bottom <= TEMPLATE_LAST_BODY_ROW) {
      try {
        ws.unMergeCells(range);
      } catch {
        /* že razdružena */
      }
    }
  }
  try {
    ws.unMergeCells(`B${TEMPLATE_SKUPAJ_ROW}:H${TEMPLATE_SKUPAJ_ROW}`);
  } catch {
    /* že razdružena */
  }
}

function excelDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

/**
 * Stolpec "dan" tako, kot je v predlogi: ponedeljek–sreda kot številka (1, 2, 3),
 * četrtek–nedelja s piko ("4." … "7.").
 */
function dayDisplay(isoWeekday: number): string | number {
  return isoWeekday <= 3 ? isoWeekday : `${isoWeekday}.`;
}

function clearDayCells(row: ExcelJS.Row): void {
  for (let c = COL_D; c <= COL_LAST; c++) {
    row.getCell(c).value = null;
  }
}

function absenceColumn(kind: ResolvedDay['kind']): number | null {
  if (kind === 'sick') return COL_SICK;
  if (kind === 'holiday') return COL_HOLIDAY;
  if (kind === 'off') return COL_VACATION;
  return null;
}

function writeDay(
  ws: ExcelJS.Worksheet,
  rowNumber: number,
  day: ResolvedDay,
  month: ResolvedMonth,
  styles: Record<keyof typeof STYLE_SOURCE_ROWS, RowSnapshot>,
): void {
  const styleKey = day.kind === 'pad' ? 'pad' : day.kind === 'weekend' ? 'weekend' : 'work';
  applySnapshot(ws, rowNumber, styles[styleKey]);

  const row = ws.getRow(rowNumber);
  clearDayCells(row);
  // `pad` dan ima datum (sosednji mesec), a v predlogi ostane brez njega — vrstica je tam
  // samo zato, da je teden poln.
  row.getCell(COL_B).value = day.kind === 'pad' ? null : excelDate(day.date);
  row.getCell(COL_C).value = dayDisplay(day.isoWeekday);

  if (day.kind === 'work') {
    const r = rowNumber;
    row.getCell(COL_D).value = timeDayFraction(month.schedule.arrival);
    row.getCell(COL_E).value = timeDayFraction(month.schedule.departure);
    row.getCell(COL_F).value = timeDayFraction(month.schedule.breakStart);
    row.getCell(COL_G).value = timeDayFraction(month.schedule.breakEnd);
    // Formule ostanejo v datoteki (uporabnik lahko čas popravi in seštevki se preračunajo),
    // `result` pa je predizračunan, ker Excel ob odprtju tuje datoteke pokaže shranjeno
    // vrednost, dokler je sam ne preračuna.
    row.getCell(COL_H).value = {
      formula: `IF((G${r}-F${r})>0,G${r}-F${r},"")`,
      result: minutesToDayFraction(month.breakMinutes),
    };
    row.getCell(COL_I).value = {
      formula: `IF((E${r}-D${r})>0,E${r}-D${r},"")`,
      result: minutesToDayFraction(day.minutes),
    };
    return;
  }

  const column = absenceColumn(day.kind);
  if (column !== null) {
    const cell = row.getCell(column);
    cell.value = minutesToDayFraction(day.minutes);
    cell.numFmt = '[h]:mm';
  }
}

function writeWeeklySumRow(
  ws: ExcelJS.Worksheet,
  rowNumber: number,
  firstDayRow: number,
  totals: ResolvedWeekTotals,
): void {
  ws.mergeCells(`B${rowNumber}:H${rowNumber}`);
  const row = ws.getRow(rowNumber);
  row.getCell(COL_B).value = 'tedenski seštevek ur';

  const cached = new Map<number, number>([
    [COL_I, totals.work],
    [COL_VACATION, totals.off],
    [COL_HOLIDAY, totals.holiday],
    [COL_SICK, totals.sick],
  ]);

  const lastDayRow = firstDayRow + 6;
  for (let c = COL_I; c <= COL_LAST; c++) {
    const letter = excelColumnLetter(c);
    row.getCell(c).value = {
      formula: `SUM(${letter}${firstDayRow}:${letter}${lastDayRow})`,
      result: minutesToDayFraction(cached.get(c) ?? 0),
    };
  }
}

function monthTotalFormula(sumRows: number[]): string {
  const sum = sumRows.map((r) => `I${r}`).join('+');
  return `IF(${sum},${sum},"")`;
}

export async function buildTimesheetWorkbook(month: ResolvedMonth): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templatePath());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Predloga evidence nima nobenega delovnega lista.');
  // Predloga nosi pogojno oblikovanje (rdeči datumi); v izhodni datoteki ga nočemo.
  ws.removeConditionalFormatting(null);

  const styles = {
    work: snapshotRow(ws, STYLE_SOURCE_ROWS.work),
    weekend: snapshotRow(ws, STYLE_SOURCE_ROWS.weekend),
    pad: snapshotRow(ws, STYLE_SOURCE_ROWS.pad),
    sum: snapshotRow(ws, STYLE_SOURCE_ROWS.sum),
    spacer: snapshotRow(ws, STYLE_SOURCE_ROWS.spacer),
  };

  // Vrednosti, sloge IN višine je treba pobrisati PRED `spliceRows`, sicer ExcelJS pusti
  // vrstice predloge kot fantome z oblikovanjem (znana napaka, ugotovljena v izvirni aplikaciji).
  for (let r = TEMPLATE_DATA_START; r < TEMPLATE_DATA_START + TEMPLATE_DATA_ROWS; r++) {
    const row = ws.getRow(r);
    // ExcelJS tipizira `height` kot `number`, čeprav je `undefined` edini način, da se višina
    // PONASTAVI — nastavljena višina preživi `spliceRows` kot fantomska vrstica.
    (row as { height?: number }).height = undefined;
    row.eachCell({ includeEmpty: false }, (cell) => {
      cell.value = null;
      cell.style = {};
    });
  }

  unmergeDataBlock(ws);
  ws.spliceRows(TEMPLATE_DATA_START, TEMPLATE_DATA_ROWS);

  // Teden zasede 7 vrstic dni + vrstico seštevka; ena prazna vrstica loči zadnji teden od "skupaj".
  const bodyRowCount = month.weeks.length * 8 + 1;
  for (let i = 0; i < bodyRowCount; i++) {
    ws.insertRow(TEMPLATE_DATA_START, []);
  }

  const totalRow = TEMPLATE_DATA_START + bodyRowCount;
  const weeklySumRows: number[] = [];

  let r = TEMPLATE_DATA_START;
  for (const week of month.weeks) {
    const firstDayRow = r;
    for (const day of week.days) {
      writeDay(ws, r, day, month, styles);
      r += 1;
    }
    applySnapshot(ws, r, styles.sum);
    writeWeeklySumRow(ws, r, firstDayRow, week.totals);
    weeklySumRows.push(r);
    r += 1;
  }

  applySnapshot(ws, r, styles.spacer);
  ws.getRow(r).eachCell({ includeEmpty: true }, (cell, col) => {
    if (col >= COL_B) cell.value = null;
  });

  try {
    ws.mergeCells(`B${totalRow}:H${totalRow}`);
  } catch {
    /* že združena */
  }
  const total = ws.getRow(totalRow);
  total.getCell(COL_B).value = 'Skupaj ure/mesec';
  total.getCell(COL_I).value = {
    formula: monthTotalFormula(weeklySumRows),
    result: minutesToDayFraction(month.totals.work),
  };

  const lastValidRow = totalRow + TEMPLATE_FOOTER_ROWS;
  if (ws.rowCount > lastValidRow) {
    ws.spliceRows(lastValidRow + 1, ws.rowCount - lastValidRow);
  }
  // Fantomske vrstice, ki jih `spliceRows` spregleda (ista napaka ExcelJS kot zgoraj).
  for (let extra = lastValidRow + 1; extra <= lastValidRow + 50; extra++) {
    const row = ws.getRow(extra);
    (row as { height?: number }).height = undefined;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.value = null;
      cell.style = {};
    });
  }

  // "Podpis delavca/ke": predloga isto besedilo hrani v vseh treh celicah združbe R:T, zato
  // se po ponovni združitvi izpiše trikrat, če se odvečni dve ne pobrišeta.
  const signatureRow = totalRow + 5;
  ws.getRow(signatureRow).getCell(19).value = null;
  ws.getRow(signatureRow).getCell(20).value = null;
  try {
    ws.unMergeCells(`R${signatureRow}:T${signatureRow}`);
  } catch {
    /* ni bila združena */
  }
  ws.mergeCells(`R${signatureRow}:T${signatureRow}`);

  // Glava dokumenta: ime, prvi dan meseca, mesečna obveza, tedenske ure.
  ws.getRow(4).getCell(9).value = month.fullName;
  ws.getRow(5).getCell(9).value = excelDate(`${month.year}-${String(month.month).padStart(2, '0')}-01`);
  ws.getRow(6).getCell(9).value = month.nominalMonthHours;
  ws.getRow(4).getCell(21).value = month.weeklyWorkHours;

  return Buffer.from(await wb.xlsx.writeBuffer());
}
