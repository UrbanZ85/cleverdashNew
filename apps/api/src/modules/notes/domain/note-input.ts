import { z } from 'zod';

// Čista domenska plast modula: brez uvozov iz express/mongoose, zato testabilna brez baze in
// brez strežnika (člen IX). Router jo samo kliče.

export const MAX_TITLE_LENGTH = 200;
export const MAX_BODY_LENGTH = 100_000;
export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;

/** Naslov in vsebina sta neobvezna vsak zase, a beležka brez obojega je prazen zapis, ki bi
 * v seznamu izgledal kot napaka — to preverja `assertNotEmpty` spodaj, ne shema, ker mora
 * pri delnem popravku (PUT samo `pinned`) veljati za ZLITO in ne za prispelo vrednost. */
export const noteWriteSchema = z.object({
  title: z.string().max(MAX_TITLE_LENGTH).optional(),
  body: z.string().max(MAX_BODY_LENGTH).optional(),
  tags: z.array(z.string()).max(MAX_TAGS).optional(),
  pinned: z.boolean().optional(),
});

export type NoteWriteInput = z.infer<typeof noteWriteSchema>;

export const notesQuerySchema = z.object({
  /** Iskanje po naslovu IN vsebini, brez razlikovanja velikih/malih črk. */
  query: z.string().trim().max(200).optional(),
  tag: z.string().trim().max(MAX_TAG_LENGTH).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Oznake se normalizirajo, da "Delo", "delo " in "DELO" ne postanejo tri različne oznake,
 * po katerih filtriranje ne najde ničesar. Vrstni red prvega pojava se ohrani — uporabnik jih
 * je v tem vrstnem redu vpisal. */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase().slice(0, MAX_TAG_LENGTH);
    if (tag.length === 0 || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
    if (result.length >= MAX_TAGS) break;
  }
  return result;
}

/** Uporabnikov niz gre v `$regex`, zato mora biti ubežen: brez tega bi vnos "c++" ali "(" v
 * iskalno polje vrgel napako regularnega izraza, `.*` pa bi tiho vrnil vse. */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Mongo filter za seznam beležk. `userId` je VEDNO del filtra — beležke so osebne
 * (data-model 004), zato ta funkcija brez njega niti ne more sestaviti poizvedbe. */
export function buildNotesFilter(params: {
  userId: string;
  query?: string;
  tag?: string;
}): Record<string, unknown> {
  const filter: Record<string, unknown> = { userId: params.userId };
  if (params.query) {
    const pattern = escapeRegExp(params.query);
    filter.$or = [{ title: { $regex: pattern, $options: 'i' } }, { body: { $regex: pattern, $options: 'i' } }];
  }
  if (params.tag) {
    const [tag] = normalizeTags([params.tag]);
    if (tag) filter.tags = tag;
  }
  return filter;
}

/** Naslov za beležko, ki ga uporabnik ni vpisal: prva vrstica vsebine, skrajšana. Izpelje se
 * ob PISANJU (in ne ob izpisu), da je enak v seznamu, v iskanju in v izvozu. */
export function deriveTitle(title: string, body: string): string {
  const trimmed = title.trim();
  if (trimmed.length > 0) return trimmed.slice(0, MAX_TITLE_LENGTH);
  const firstLine = body.split('\n').find((line) => line.trim().length > 0) ?? '';
  return firstLine.trim().slice(0, 80);
}

/** Vrsta zvoka iz glave `Content-Type`. Pripona s kodekom (`audio/webm;codecs=opus`, kar
 * pošlje MediaRecorder v Chromu) se odreže — shranjena vrsta mora biti predvajljiva nazaj
 * skozi `<audio>`, tam pa parameter kodeka ni potreben. Vrne `null` za vse, kar ni zvok:
 * ta endpoint sprejema posnetke, ne poljubnih datotek. */
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/x-m4a',
]);

export function normalizeAudioMimeType(header: string | undefined): string | null {
  if (!header) return null;
  const base = header.split(';')[0]!.trim().toLowerCase();
  return ALLOWED_AUDIO_TYPES.has(base) ? base : null;
}
