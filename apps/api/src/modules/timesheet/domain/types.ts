// Prenos iz samostojne aplikacije "Kaja_EDC" (src/edc/types.ts). Člen X ustave: polja API-ja
// so ANGLEŠKA, zato so izvirna slovenska imena (`prihod`, `odhod`, `odmorOd`, `odmorDo`)
// preimenovana. Slovenščina ostane tam, kamor spada — v naslovih stolpcev predloge .xlsx in
// v besedilu UI.

/** Ura in minuta (24-urni zapis). */
export interface TimeHm {
  h: number;
  m: number;
}

/** Razrešen delovni urnik za vrstice "delovni dan". */
export interface DaySchedule {
  arrival: TimeHm;
  departure: TimeHm;
  breakStart: TimeHm;
  breakEnd: TimeHm;
}

/** Kar sme poslati odjemalec: karkoli manjka, prevzame privzeto vrednost (domain/schedule.ts). */
export type DayScheduleInput = {
  [K in keyof DaySchedule]?: Partial<TimeHm>;
};

/**
 * Telo zahteve po razrešitvi z zod shemo (domain/input.schema.ts).
 *
 * `sickDays`/`holidays`/`offDays` so ŠTEVILKE DNI v izbranem mesecu (1–31), npr. 9. april je
 * `9`. Veljajo samo za ponedeljek–petek; sobota in nedelja sta vedno vikend, tudi če je ista
 * številka navedena v seznamu odsotnosti.
 */
export interface TimesheetRequest {
  year: number;
  month: number;
  fullName: string;
  weeklyWorkHours: number;
  sickDays: number[];
  holidays: number[];
  offDays: number[];
  schedule: DaySchedule;
}

/**
 * Vrsta dneva v mesečni mreži. `pad` je dan iz sosednjega meseca, ki dopolni teden do
 * ponedeljek–nedelja — v predlogi ima vrstico, a nima datuma.
 */
export type DayKind = 'work' | 'weekend' | 'sick' | 'holiday' | 'off' | 'pad';
