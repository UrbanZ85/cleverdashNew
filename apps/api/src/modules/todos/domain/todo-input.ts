import { z } from 'zod';

// Čista domenska plast (člen IX): brez uvozov iz express in mongoose. Kjer je potreben
// identifikator, se PODAJA (`makeTask`) — tako ta plast ostane brez mongoosa in lahko test
// poda stalne ID-je namesto naključnih.
//
// Delitev dela je enaka kot pri beležkah: zod pove OBLIKO (tipi, dolžine, nabori), te funkcije
// pa POMEN (kaj je prazno besedilo, kaj je ena vrstica, kaj je opravilo).

export const MAX_LIST_TITLE_LENGTH = 100;
export const MAX_TASK_TITLE_LENGTH = 200;
export const MAX_TASKS_PER_LIST = 200;
export const MAX_TASKS_PER_REQUEST = 50;
export const MAX_LISTS_PER_USER = 50;
export const MAX_MEMBERS_PER_LIST = 25;

/** Meje, ki gredo v odgovor `GET /todos/lists`, da odjemalec napako pokaže, preden pošlje
 * zahtevo, ki bo zavrnjena. Konstante, ne stanje — zato potujejo z odgovorom in nimajo
 * svojega endpointa. */
export const TODO_LIMITS = {
  maxListTitleLength: MAX_LIST_TITLE_LENGTH,
  maxTaskTitleLength: MAX_TASK_TITLE_LENGTH,
  maxTasksPerList: MAX_TASKS_PER_LIST,
  maxTasksPerRequest: MAX_TASKS_PER_REQUEST,
  maxListsPerUser: MAX_LISTS_PER_USER,
  maxMembersPerList: MAX_MEMBERS_PER_LIST,
} as const;

/**
 * Očisti besedilo opravila.
 *
 * Prelomi vrstic se zlijejo v presledek in se NE ohranijo: naslov s prelomom se v vrstici
 * seznama izriše kot pokvarjena vrstica, hitri vnos pa prelome dobi ob vsakem prilepljenem
 * besedilu. Kdor želi več vrstic, želi več opravil — za to je `splitPastedTitles`.
 *
 * Krmilni znaki se odstranijo: v besedilo pridejo s kopiranjem iz preglednic in v vmesniku
 * niso vidni, so pa vidni v primerjavah in v dnevniku.
 *
 * Vrne prazen niz, kadar ne ostane nič uporabnega — usmerjevalnik tak vnos zavrne s 400 in ga
 * NE preskoči tiho (FR-014).
 */
export function sanitizeTaskTitle(raw: string): string {
  return collapse(raw, MAX_TASK_TITLE_LENGTH);
}

/** Enako za ime seznama, z drugo mejo. */
export function sanitizeListTitle(raw: string): string {
  return collapse(raw, MAX_LIST_TITLE_LENGTH);
}

/**
 * Krmilni znak -> presledek, nato zlitje presledkov, obrez in rez na mejo.
 *
 * Namenoma BREZ regularnega izraza za razred krmilnih znakov. Tak razred je treba v izvorni
 * kodi zapisati z ubeznimi zaporedji, ta pa se ob posegu v datoteko lahko spremenijo v
 * dobesedne, nevidne bajte — pri pisanju te datoteke se je to tudi zgodilo in prevajalnik
 * tega ne opazi. Primerjava kodnih tock je daljsa, a je ni mogoce tiho pokvariti.
 *
 * Tabulator in prelom vrstice nista izjemi: postaneta presledek in ju zlije korak spodaj.
 */
function collapse(raw: string, maxLength: number): string {
  let out = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 32 || code === 127 ? ' ' : ch;
  }
  return out.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/**
 * Prilepljeno večvrstično besedilo v seznam naslovov — po ENO opravilo na vrstico (FR-013).
 *
 * To je pravilno vedenje za nakupovalni seznam in edini razlog, da `POST /tasks` sploh sprejme
 * `titles[]` namesto enega naslova. Prazne vrstice se izpustijo; vrstica, od katere po čiščenju
 * ne ostane nič, se ne šteje.
 */
export function splitPastedTitles(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => sanitizeTaskTitle(line))
    .filter((line) => line.length > 0);
}

export interface NewTask {
  title: string;
  done: boolean;
  doneAt: Date | null;
  doneBy: null;
  dueDate: Date | null;
  position: number;
  createdAt: Date;
}

/**
 * Sestavi CELOTNO podpolje opravila.
 *
 * Nobeno polje se ne zanaša na `default` iz podsheme: Mongoose privzetkov ob `$push` prek
 * `findOneAndUpdate` ne uveljavi enako zanesljivo kot ob `save()`, vsa pisanja v tem modulu pa
 * gredo prek operatorjev. Privzetek, ki se enkrat uveljavi in drugič ne, je slabši od
 * vrednosti, ki jo vedno nastavi domenska plast.
 */
export function makeTask(params: {
  title: string;
  position: number;
  dueDate: Date | null;
  now: Date;
}): NewTask {
  return {
    title: params.title,
    done: false,
    doneAt: null,
    doneBy: null,
    dueDate: params.dueDate,
    position: params.position,
    createdAt: params.now,
  };
}

// ---------------------------------------------------------------------------------------
// Zod sheme — samo OBLIKA. Pomen je v funkcijah zgoraj.
// ---------------------------------------------------------------------------------------

/** Koledarski dan brez ure. `null` je pomenska vrednost ("odstrani rok") in se loči od
 * izpuščenega polja ("ne spreminjaj") — enak dogovor kot pri `PUT /settings`. */
const dueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Rok mora biti oblike YYYY-MM-DD.')
  .nullable();

export const listCreateSchema = z.object({
  title: z.string().min(1).max(MAX_LIST_TITLE_LENGTH),
});

export const listPatchSchema = z
  .object({
    title: z.string().min(1).max(MAX_LIST_TITLE_LENGTH).optional(),
    locked: z.boolean().optional(),
  })
  .refine((v) => v.title !== undefined || v.locked !== undefined, {
    message: 'Navesti je treba vsaj eno polje.',
  });

export const taskCreateSchema = z.object({
  titles: z.array(z.string().min(1)).min(1).max(MAX_TASKS_PER_REQUEST),
  dueDate: dueDateSchema.optional(),
});

export const taskPatchSchema = z
  .object({
    done: z.boolean().optional(),
    title: z.string().min(1).max(MAX_TASK_TITLE_LENGTH).optional(),
    dueDate: dueDateSchema.optional(),
  })
  .refine((v) => v.done !== undefined || v.title !== undefined || v.dueDate !== undefined, {
    message: 'Navesti je treba vsaj eno polje.',
  });

export const orderSchema = z.object({
  taskIds: z.array(z.string()).max(MAX_TASKS_PER_LIST),
});

export const memberPutSchema = z.object({
  role: z.enum(['view', 'check', 'edit']),
});

export const currentQuerySchema = z.object({
  listId: z.string().optional(),
});

export const listsQuerySchema = z.object({
  includeTasks: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
});

export const directoryQuerySchema = z.object({
  query: z.string().max(100).optional(),
  excludeSelf: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v !== 'false'),
});
