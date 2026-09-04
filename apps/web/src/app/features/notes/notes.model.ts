// Čist podatkovni model in logika modula "Beležke" — BREZ uvozov iz @angular/*, da je
// preverljiva z enotnimi testi brez TestBed-a (isti vzorec kot core/settings/settings.model.ts
// in core/embeds/embed-address.ts).

export type TranscriptSource = 'browser' | 'server';
export type TranscriptStatus = 'none' | 'done' | 'failed';

export interface NoteAudio {
  id: string;
  mimeType: string;
  byteSize: number;
  durationMs: number | null;
  transcript: string | null;
  transcriptSource: TranscriptSource | null;
  transcriptStatus: TranscriptStatus;
  transcriptError: string | null;
  createdAt: string;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  audio: NoteAudio[];
  createdAt: string;
  updatedAt: string;
}

/** Zapis v seznamu: brez posnetkov samih, samo njihovo število (glej GET /notes). */
export interface NoteListItem {
  id: string;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  audioCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotesListResponse {
  notes: NoteListItem[];
  total: number;
  tags: string[];
}

export interface NotesCapabilities {
  serverTranscription: {
    /** Ali je zunanja storitev za prepis nastavljena v okolju strežnika. */
    configured: boolean;
    /** Ali je uporabnik pošiljanje posnetkov ven dovolil v svojih nastavitvah. */
    enabled: boolean;
    available: boolean;
    reason: 'not-configured' | 'not-enabled' | null;
    detail: string | null;
  };
  audioMaxBytes: number;
}

export interface NoteDraft {
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
}

/** Oznake se vpisujejo v eno polje, ločene z vejico — dva vnosna načina (žetoni + polje) bi
 * bila za to količino podatka preveč. Ločilo je vejica in NE presledek, ker je oznaka lahko
 * dvobesedna ("odprta vprašanja"). */
export function parseTagInput(input: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of input.split(',')) {
    const tag = part.trim().toLowerCase();
    if (tag.length === 0 || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }
  return result;
}

export function formatTagInput(tags: readonly string[]): string {
  return tags.join(', ');
}

/** Prilepi narekovano besedilo na obstoječo vsebino. Ne gre za navadno lepljenje nizov:
 * brez presledka bi se zadnja beseda prejšnjega odstavka zlila s prvo novega ("koncanovo"),
 * kar je v narekovanem besedilu najpogostejša okvara. Če prejšnja vsebina konča z ločilom
 * ali prelomom vrstice, se ta ohrani takšen, kot je. */
export function appendDictation(existing: string, addition: string): string {
  const text = addition.trim();
  if (text.length === 0) return existing;
  if (existing.length === 0) return text;
  if (/\s$/.test(existing)) return `${existing}${text}`;
  return `${existing} ${text}`;
}

/** "0:07", "1:42", "12:03" — brez ur, ker beležka ni podkast; posnetek, daljši od ure, se
 * izpiše kot "73:12" in to je še vedno berljivo. */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '—';
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Prvih nekaj vrstic vsebine za kartico v seznamu. Prelomi vrstic se zamenjajo s presledki:
 * v kartici fiksne višine bi prazna vrstica pojedla ves prostor za besedilo. */
export function notePreview(body: string, maxLength = 160): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > maxLength ? `${flat.slice(0, maxLength - 1)}…` : flat;
}

/** Kaj naj piše na gumbu/znački ob posnetku glede na stanje prepisa. Na enem mestu, ker se
 * isto stanje izpiše v urejevalniku IN v seznamu posnetkov. */
export function describeTranscript(audio: NoteAudio): string {
  if (audio.transcriptStatus === 'failed') return audio.transcriptError ?? 'Prepis je spodletel.';
  if (audio.transcriptStatus === 'done') {
    return audio.transcriptSource === 'server' ? 'Prepisano na strežniku' : 'Narekovano v brskalniku';
  }
  return 'Brez prepisa';
}
