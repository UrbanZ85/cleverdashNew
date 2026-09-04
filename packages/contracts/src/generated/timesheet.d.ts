export interface paths {
    "/timesheet/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Predogled meseca kot JSON
         * @description Vrne iste dneve in seštevke kot `.xlsx`, samo brez preglednice — odjemalec zato ne
         *     podvaja koledarske logike (kateri dan je vikend, koliko ur nosi teden).
         *     Zahtevani obseg: `timesheet:generate`.
         */
        post: operations["previewTimesheet"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/timesheet/workbook": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Mesečna evidenca kot .xlsx
         * @description Vrne datoteko `evidenca-<leto>-<mesec>.xlsx`, zgrajeno po predlogi delodajalca.
         *     Odgovor je binaren in nosi `Cache-Control: no-store` — evidenca je osebni dokument.
         *     Zahtevani obseg: `timesheet:generate`.
         */
        post: operations["generateTimesheetWorkbook"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/timesheet/defaults": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Shranjeni privzetki
         * @description Vrednosti, ki so za vsak mesec enake. Neshranjen urnik vrne privzetek 9:00–17:00 z
         *     malico 12:30–13:00. Zahtevani obseg: `timesheet:read`.
         */
        get: operations["readTimesheetDefaults"];
        /**
         * Shrani privzetke
         * @description Delna posodobitev: neposlana polja obdržijo trenutno vrednost. Urnik z odhodom pred
         *     prihodom je zavrnjen, da ne pokvari vseh naslednjih evidenc.
         *     Zahtevani obseg: `timesheet:write`.
         */
        put: operations["writeTimesheetDefaults"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @description RFC 9457 problem details — ista oblika kot 001–005. */
        Problem: {
            type: string;
            title: string;
            status: number;
            detail?: string;
            correlationId?: string;
        };
        TimeHm: {
            h: number;
            m: number;
        };
        /**
         * @description Delovni čas, ki velja za vsak delovni dan v mesecu. Imena polj so angleška (člen X);
         *     slovenski so naslovi stolpcev v predlogi (prihod, odhod, malica).
         */
        DaySchedule: {
            arrival: components["schemas"]["TimeHm"];
            departure: components["schemas"]["TimeHm"];
            breakStart: components["schemas"]["TimeHm"];
            breakEnd: components["schemas"]["TimeHm"];
        };
        /** @description Vsako polje in vsaka ura/minuta je neobvezna — manjkajoče prevzame shranjeni privzetek. */
        PartialDaySchedule: {
            arrival?: components["schemas"]["PartialTimeHm"];
            departure?: components["schemas"]["PartialTimeHm"];
            breakStart?: components["schemas"]["PartialTimeHm"];
            breakEnd?: components["schemas"]["PartialTimeHm"];
        };
        PartialTimeHm: {
            h?: number;
            m?: number;
        };
        DayNumbers: number[];
        TimesheetRequest: {
            year: number;
            month: number;
            /** @description Brez tega mora ime priti iz shranjenih privzetkov, sicer je odgovor 400. */
            fullName?: string;
            /** @default 40 */
            weeklyWorkHours: number;
            sickDays?: components["schemas"]["DayNumbers"];
            holidays?: components["schemas"]["DayNumbers"];
            offDays?: components["schemas"]["DayNumbers"];
            schedule?: components["schemas"]["PartialDaySchedule"];
        };
        /**
         * @description `pad` je dan iz sosednjega meseca, ki dopolni teden do ponedeljek–nedelja — v
         *     preglednici ima vrstico, a nima datuma.
         * @enum {string}
         */
        DayKind: "work" | "weekend" | "sick" | "holiday" | "off" | "pad";
        ResolvedDay: {
            /** Format: date */
            date: string;
            dayOfMonth: number;
            inMonth: boolean;
            /** @description 1 = ponedeljek … 7 = nedelja. */
            isoWeekday: number;
            kind: components["schemas"]["DayKind"];
            /** @description Minute, ki jih dan prispeva v svoj stolpec (redne ure ali odsotnost). */
            minutes: number;
        };
        /** @description Minute po vrstah — cela števila, da se ure nikjer ne zaokrožujejo. */
        Totals: {
            work: number;
            holiday: number;
            sick: number;
            off: number;
        };
        ResolvedWeek: {
            days: components["schemas"]["ResolvedDay"][];
            totals: components["schemas"]["Totals"];
        };
        TimesheetPreview: {
            year: number;
            month: number;
            fullName: string;
            weeklyWorkHours: number;
            schedule: components["schemas"]["DaySchedule"];
            /** @description Mesečna delovna obveza — število delovnikov (pon–pet) krat 8 ur. */
            nominalMonthHours: number;
            breakMinutes: number;
            totals: components["schemas"]["Totals"];
            weeks: components["schemas"]["ResolvedWeek"][];
            /** @example evidenca-2026-03.xlsx */
            fileName: string;
        };
        TimesheetDefaults: {
            /**
             * @description `null`, dokler ga uporabnik ne shrani. Ime NI privzeto ime računa — evidenca se
             *     lahko izpolnjuje za osebo, ki ni prijavljeni uporabnik.
             */
            fullName: string | null;
            weeklyWorkHours: number;
            schedule: components["schemas"]["DaySchedule"];
        };
        TimesheetDefaultsWrite: {
            fullName?: string | null;
            weeklyWorkHours?: number;
            schedule?: components["schemas"]["PartialDaySchedule"];
        };
    };
    responses: {
        /** @description Neveljavno telo zahteve (neobstoječ dan, obrnjen urnik, manjkajoče ime) */
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
    };
    parameters: {
        /** @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat — enaka semantika kot 001–005. */
        IdempotencyKey: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    previewTimesheet: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TimesheetRequest"];
            };
        };
        responses: {
            /** @description Razrešen mesec */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TimesheetPreview"];
                };
            };
            400: components["responses"]["BadRequest"];
        };
    };
    generateTimesheetWorkbook: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TimesheetRequest"];
            };
        };
        responses: {
            /** @description Preglednica */
            200: {
                headers: {
                    /** @description attachment; filename="evidenca-2026-03.xlsx" */
                    "Content-Disposition"?: string;
                    "Cache-Control"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": string;
                };
            };
            400: components["responses"]["BadRequest"];
        };
    };
    readTimesheetDefaults: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Privzetki */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TimesheetDefaults"];
                };
            };
        };
    };
    writeTimesheetDefaults: {
        parameters: {
            query?: never;
            header?: {
                /** @description Ponovljen klic z isto vrednostjo vrne prvotni rezultat — enaka semantika kot 001–005. */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["TimesheetDefaultsWrite"];
            };
        };
        responses: {
            /** @description Shranjeni privzetki */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TimesheetDefaults"];
                };
            };
            400: components["responses"]["BadRequest"];
        };
    };
}
