import { loadEnv } from '../../../platform/config/env.js';

// FR-047: dušenje javne poti, da žetonov ni mogoče ugibati.
//
// ZAVESTNA RAZLIKA do modula 009, ki duši prek zbirke `FileShareAttempt`: tam se ugiba GESLO k
// znani povezavi, zato mora števec preživeti ponovni zagon — sicer bi ga napadalec ponastavil s
// tem, da počaka na naslednjo namestitev, in bi bilo dušenje navidezno.
//
// Tu gesla ni. Ugibati je mogoče samo 128-bitni žeton, česar dušenje ne prepreči in tudi ne
// poskuša: prostor je prevelik, da bi bilo ugibanje kdaj uspešno. Dušenje je tu proti
// PREGLEDOVANJU — proti tisočim zahtevam na minuto, ki bi zasedle strežnik — in za to je okno v
// pomnilniku dovolj. Zapisovanje vsakega obiska javne strani v bazo bi bilo pisanje v bazo ob
// vsakem obisku, kar je dražje od tega, kar brani.
//
// POSLEDICA, ki jo je treba poznati: števec je na PROCES in se ob ponovnem zagonu ponastavi. V tej
// namestitvi (en vsebnik `api`) to pomeni en števec; ob več primerkih bi jih bilo več in bi bila
// dejanska meja zmnožek. Kadar bo to pomembno, je selitev v skupno hrambo zamenjava te ene
// datoteke — vmesnik navzven je ena funkcija.

interface Window {
  startedAt: number;
  count: number;
}

const windows = new Map<string, Window>();

/** Nad toliko različnimi naslovi se mapa počisti. Brez te meje bi bila mapa, polnjena z
 * naslovov iz omrežja, počasi rastoča poraba pomnilnika — torej ista napaka, pred katero
 * dušenje brani. */
const MAX_TRACKED_KEYS = 10_000;

export interface ThrottleVerdict {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Ali sme ta naslov zdaj poklicati javno pot.
 *
 * Okno je fiksno in ne drseče: po izteku se števec ponastavi. Drseče okno bi terjalo hrambo časov
 * posameznih zahtev, kar je pri tej rabi cena brez koristi — meja je ista v obeh primerih, razlika
 * je le v tem, kako ostro je porazdeljena na robu okna.
 */
export function checkPublicRate(ip: string | undefined, now = Date.now()): ThrottleVerdict {
  const env = loadEnv();
  const windowMs = env.RECIPES_PUBLIC_RATE_WINDOW_SECONDS * 1000;
  // `app.set('trust proxy', 1)` v main.ts poskrbi, da je `req.ip` naslov odjemalca, ne Caddyja.
  const key = ip ?? 'neznan';

  const existing = windows.get(key);
  if (!existing || now - existing.startedAt >= windowMs) {
    if (windows.size >= MAX_TRACKED_KEYS) windows.clear();
    windows.set(key, { startedAt: now, count: 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > env.RECIPES_PUBLIC_RATE_LIMIT) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.startedAt + windowMs - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Samo za teste: brez tega bi se okna prenašala med primeri in bi bil vrstni red testov
 * pomemben. */
export function resetPublicRateLimiter(): void {
  windows.clear();
}
