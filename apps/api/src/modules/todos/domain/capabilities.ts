// Čista domenska plast modula (člen IX): brez uvozov iz express, mongoose ali
// platform/errors, zato testabilna brez baze in brez strežnika. Usmerjevalnik jo samo kliče.
//
// Tu je CEL model pravic tega modula. Vsaka odločitev "kdo sme kaj" gre skozi `denyReason`;
// nikjer drugje v modulu ni pogoja oblike `if (role === 'edit')`. Razlog je preverljivost:
// matriko 4 vlog × 10 zmožnosti × zaklenjeno/odklenjeno je mogoče v celoti pokriti s tabelnim
// testom, raztresenih pogojev pa ne.
//
// Delitev na `denyReason` (RAZLOG) in `describeDeny` (BESEDILO) je vzorec
// modules/notes/domain/transcription-gate.ts: domena pove, zakaj ne gre, storitev iz tega
// naredi ProblemError. Zato ta datoteka ne uvaža platform/errors in ne pozna statusnih kod.

export const MEMBER_ROLES = ['view', 'check', 'edit'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Vloga klicatelja na seznamu. Lastništvo NI stopnja soudeleženca — je lastnost seznama. */
export type TodoRole = 'owner' | MemberRole;

export const TODO_CAPABILITIES = [
  'readList',
  'toggleTask',
  'writeTasks',
  'reorderTasks',
  'clearCompleted',
  'renameList',
  'deleteList',
  'manageSharing',
  'toggleLock',
  'leaveList',
] as const;
export type TodoCapability = (typeof TODO_CAPABILITIES)[number];

/**
 * Zakaj dejanje ni dovoljeno. Razloga sta dva, ker sta navzven dva RAZLIČNA odgovora (403 in
 * 409) in dva različna odziva vmesnika — zato nista združena v eno logično vrednost:
 *
 * - `role` — trajno stanje klicatelja. Vmesnik naj kontrolo SKRIJE.
 * - `locked` — minljivo stanje ZAPISA, ki ga lastnik odklene z enim klikom. Vmesnik naj
 *   kontrolo PUSTI in pokaže ključavnico.
 */
export type DenyReason = 'role' | 'locked';

interface ListLike {
  ownerId: unknown;
  members: readonly { userId: unknown; role: MemberRole }[];
}

/**
 * Vloga uporabnika na že prebranem posnetku seznama, ali `null`, če je tujec.
 *
 * Lastništvo se preveri PRVO in neodvisno od `members`: če bi se v zapis kdaj prikradel vnos
 * lastnika med soudeleženci (pisanja tega ne dovolijo), ga to ne sme znižati.
 */
export function roleFor(list: ListLike, userId: string): TodoRole | null {
  if (String(list.ownerId) === userId) return 'owner';
  const member = list.members.find((m) => String(m.userId) === userId);
  return member ? member.role : null;
}

/** Katere stopnje soudeleženca smejo zmožnost, kadar seznam NI zaklenjen. Lastnika v tabeli
 * ni — njegove pravice določa `denyReason` posebej, ker niso podmnožica nobene stopnje. */
const ROLES_ALLOWED: Record<TodoCapability, readonly MemberRole[]> = {
  readList: ['view', 'check', 'edit'],
  toggleTask: ['check', 'edit'],
  writeTasks: ['edit'],
  reorderTasks: ['edit'],
  clearCompleted: ['edit'],
  renameList: [],
  deleteList: [],
  manageSharing: [],
  toggleLock: [],
  leaveList: ['view', 'check', 'edit'],
};

/**
 * Zmožnosti, ki jih zaklep NE omeji.
 *
 * `readList`, ker branje ni sprememba. `leaveList`, ker zaklep omejuje spremembe V seznamu,
 * ne pripadnosti tujim podatkom — zaklep, ki bi človeka priklenil na tuj seznam, bi bil nekaj
 * drugega od tega, kar zaklep pomeni (FR-047).
 */
const UNAFFECTED_BY_LOCK: readonly TodoCapability[] = ['readList', 'leaveList'];

/**
 * Razlog zavrnitve, ali `null`, kadar je dejanje dovoljeno.
 *
 * Vrstni red preverjanj je pomemben: vloga PRED ključavnico. Soudeleženec s stopnjo `view`,
 * ki poskusi pisati po zaklenjenem seznamu, dobi razlog `role` in ne `locked` — odklep mu
 * namreč ne bi nič pomagal, sporočilo o ključavnici pa bi ga poslalo prosit za napačno stvar.
 */
export function denyReason(
  role: TodoRole,
  locked: boolean,
  capability: TodoCapability,
): DenyReason | null {
  if (role === 'owner') {
    // Lastnika zaklep NE omejuje (FR-062). Edina zmožnost, ki je nima, je odhod s svojega
    // seznama — te mu ne odvzame ključavnica, ampak lastništvo samo: lastnik seznama ne more
    // zapustiti, lahko ga samo izbriše (FR-047).
    return capability === 'leaveList' ? 'role' : null;
  }
  if (!ROLES_ALLOWED[capability].includes(role)) return 'role';
  if (locked && !UNAFFECTED_BY_LOCK.includes(capability)) return 'locked';
  return null;
}

/** Slovensko pojasnilo za uporabnika. Pove, kaj storiti ali koga vprašati — ne ponovi
 * statusne kode z drugimi besedami. */
export function describeDeny(
  reason: DenyReason,
  role: TodoRole,
  capability: TodoCapability,
): string {
  if (reason === 'locked') {
    return 'Lastnik je seznam zaklenil. Dokler je zaklenjen, sprememb ni mogoče shraniti.';
  }
  switch (capability) {
    case 'readList':
      return 'Do tega seznama nimaš dostopa.';
    case 'renameList':
      return 'Ime seznama lahko spremeni samo lastnik.';
    case 'deleteList':
      return 'Seznam lahko izbriše samo lastnik.';
    case 'manageSharing':
      return 'Kdo ima dostop do seznama, določa samo lastnik.';
    case 'toggleLock':
      return 'Seznam lahko zaklene ali odklene samo lastnik.';
    case 'toggleTask':
      return 'Pri tem seznamu imaš pravico samo za ogled. Za odkljukavanje prosi lastnika.';
    case 'writeTasks':
      return role === 'check'
        ? 'Pri tem seznamu lahko opravila samo odkljukaš — dodajanje, urejanje in brisanje so pravica urejanja.'
        : 'Pri tem seznamu imaš pravico samo za ogled.';
    case 'reorderTasks':
      return 'Vrstni red opravil lahko spremeni samo, kdor ima pravico urejanja.';
    case 'clearCompleted':
      return 'Opravljena opravila lahko počisti samo, kdor ima pravico urejanja.';
    case 'leaveList':
      return 'Lastnik seznama ga ne more zapustiti — lahko ga samo izbriše.';
  }
}

/** Kaj ta klicatelj na tem seznamu sme, v enem objektu za odgovor API-ja. Vmesnik iz tega
 * izriše kontrole in ničesar ne ugiba (člen XI). */
export function capabilitiesFor(role: TodoRole, locked: boolean): Record<TodoCapability, boolean> {
  const out = {} as Record<TodoCapability, boolean>;
  for (const capability of TODO_CAPABILITIES) {
    out[capability] = denyReason(role, locked, capability) === null;
  }
  return out;
}

/**
 * Zmožnost, ki jo zahteva delna posodobitev opravila — TU in nikjer drugje.
 *
 * To je edini razlog, da stopnja `check` sploh obstaja: `done` je preklop, `title` in
 * `dueDate` sta urejanje vsebine. Telo z obojim zahteva višjo od obeh.
 */
export function requiredCapabilityFor(fields: {
  done?: boolean;
  title?: string;
  dueDate?: Date | null;
}): TodoCapability {
  if (fields.title !== undefined || fields.dueDate !== undefined) return 'writeTasks';
  if (fields.done !== undefined) return 'toggleTask';
  // Prazno telo zavrne shema pred tem. Če bi kdaj prišlo do sem, je varen odgovor NAJSTROŽJA
  // zmožnost, ne najmilejša — privzetek, ki v dvomu dovoli, je varnostna napaka.
  return 'writeTasks';
}

/**
 * Stopnje, ki jih sme filter zapisa sprejeti za dano zmožnost.
 *
 * Obstaja zato, da `writeGuard` (services/task-write.service.ts) in `denyReason` ne moreta
 * razhajati: oba izhajata iz iste tabele. Brez tega bi bila sprememba pravic sprememba na
 * dveh mestih, druga pa bi se tiho pozabila.
 */
export function rolesWith(capability: TodoCapability): MemberRole[] {
  return [...ROLES_ALLOWED[capability]];
}
