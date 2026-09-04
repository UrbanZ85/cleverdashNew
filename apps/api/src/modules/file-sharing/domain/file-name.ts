// FR-007, research.md §20: ime datoteke je UPORABNIKOV VNOS. Uporablja se izključno za
// prikaz in za glavo `Content-Disposition` — nikoli kot pot na disku (pot je `storageId`,
// glej services/blob-storage.service.ts).
//
// Kljub temu ga je treba očistiti, in sicer iz dveh različnih razlogov:
//  1. znak za novo vrstico v imenu je vbrizg v glave odgovora, tudi kadar ime nikoli ni pot;
//  2. če se kdaj kdo zmoti in ime vseeno uporabi kot pot, `..` in ločila poti tam ne smejo
//     več biti — obramba mora zdržati tudi napako, ki je danes ni.
//
// Člen IX: čista funkcija, brez baze, omrežja in datotečnega sistema.

const MAX_LENGTH = 200;
const FALLBACK = 'datoteka';
/** Koliko znakov še šteje za končnico ob krajšanju — `.tar.gz` da `.gz`, `.dolgaBeseda` ne. */
const MAX_EXTENSION_LENGTH = 12;

/** Krmilni znaki (vključno z `\r` in `\n` — vbrizg v glavo) in nevidni znaki. */
// eslint-disable-next-line no-control-regex -- krmilni znaki so natanko tisto, kar ta izraz lovi
const INVISIBLE = /[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g;

function truncatePreservingExtension(name: string, max: number): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf('.');
  const hasExtension = dot > 0 && name.length - dot <= MAX_EXTENSION_LENGTH;
  const extension = hasExtension ? name.slice(dot) : '';
  const stem = hasExtension ? name.slice(0, dot) : name;
  return stem.slice(0, Math.max(1, max - extension.length)) + extension;
}

/**
 * Vrne varno PRIKAZNO ime. Nikoli ne vrne praznega niza — vnos, od katerega ne ostane nič,
 * postane `datoteka`, ker je zapis brez imena za uporabnika neuporaben.
 */
export function sanitizeFileName(raw: unknown): string {
  const withoutInvisible = String(raw ?? '').replace(INVISIBLE, '');

  // Zadnji NEPRAZEN segment: `../../etc/passwd` → `passwd`, `C:\pot\ime.txt` → `ime.txt`.
  const segments = withoutInvisible.split(/[/\\]+/).filter((s) => s.length > 0);
  const last = segments.length > 0 ? segments[segments.length - 1]! : '';

  const collapsed = last
    // Narekovaj bi bilo treba ubežati v `Content-Disposition`; ker v imenu ničesar ne pove,
    // ga raje ni.
    .replace(/"/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Ime, ki so same pike (`.`, `..`), ni ime — je pot. Vodilna pika sicer OSTANE: skrita
  // datoteka (`.env.example`) je legitimno ime.
  if (collapsed.length === 0 || /^\.+$/.test(collapsed)) return FALLBACK;

  return truncatePreservingExtension(collapsed, MAX_LENGTH);
}
