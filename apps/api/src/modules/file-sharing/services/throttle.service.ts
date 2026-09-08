import { loadEnv } from '../../../platform/config/env.js';
import { FileShareAttemptModel } from '../models/file-share-attempt.model.js';
import {
  isLocked,
  registerFailure,
  remainingAttempts,
  retryAfterSeconds,
  type AttemptLimits,
  type AttemptState,
} from '../domain/attempt-window.js';

// FR-030/FR-031, research.md §9: dušenje ugibanja gesla na javni poti.
//
// V tem zaledju dušenja doslej ni bilo nikjer — `login-throttle.service.ts` je bil v 004
// izbrisan, ko je dušenje prijav prevzel Keycloak. Ta storitev je zato NOVA sestavina, ne
// uporaba obstoječe.
//
// Zavestno je v modulu in ne v `platform/`: potrebuje jo ta modul, posplošitev brez drugega
// odjemalca bi bila ugibanje o prihodnji potrebi. Odvisna je samo od svojega modela in ure,
// zato je poznejša selitev v `platform/` premik datoteke, ne predelava (člen I).
//
// 009b: dva ugibalca, ne en. Poleg gesla za PREVZEM se po isti poti duši tudi koda za ODDAJO v
// sprejemni predal. Ključa sta zato dva različna (`link:` in `inbox:`), števec naslova pa je
// SKUPEN: napadalec, ki ugiba po obeh javnih površinah z istega naslova, je en napadalec in mora
// zadeti isto mejo. Ločena števca naslova bi mu mejo podvojila.

export interface ThrottleVerdict {
  locked: boolean;
  retryAfterSeconds: number;
  remaining: number;
}

export interface FailureVerdict extends ThrottleVerdict {
  /** Zaklep POVEZAVE oz. PREDALA, ločeno od zaklepa naslova — samo ta se pokaže lastniku
   * (FR-033, FR-090). Naslov je zaklenjen napadalcu, ne datoteki, in bi ga bilo zavajajoče
   * prikazati kot zaklep povezave. */
  subjectLockedUntil: Date | null;
}

export function linkKey(fileId: string): string {
  return `link:${fileId}`;
}

/** 009b: predal ima svoj števec, ločen od števca povezave — ugibanje kode za oddajo ne sme
 * zakleniti prevzema tuje datoteke in narobe. */
export function inboxKey(inboxId: string): string {
  return `inbox:${inboxId}`;
}

/** Naslov iz `req.ip`. `app.set('trust proxy', 1)` v main.ts poskrbi, da je to naslov
 * odjemalca, ne Caddyja. */
export function ipKey(ip: string | undefined): string {
  return `ip:${ip ?? 'neznan'}`;
}

function limits(): AttemptLimits {
  const env = loadEnv();
  return {
    limit: env.FILE_SHARE_ATTEMPT_LIMIT,
    windowMs: env.FILE_SHARE_ATTEMPT_WINDOW_MINUTES * 60 * 1000,
    lockMs: env.FILE_SHARE_LOCK_MINUTES * 60 * 1000,
  };
}

async function readState(key: string): Promise<AttemptState | null> {
  const doc = await FileShareAttemptModel.findOne({ key }).lean();
  if (!doc) return null;
  return {
    windowStartedAt: doc.windowStartedAt,
    count: doc.count,
    lockedUntil: doc.lockedUntil ?? null,
  };
}

/**
 * Ali je ta ključ trenutno zaklenjen.
 *
 * Zapadlost se PREVERJA, ne prepušča TTL indeksu: TTL monitor teče na ~60 s in zamika ne
 * obljublja, zato bi bil zaklep brez tega lahko minuto predolg — ali, kar je slabše, zapis o
 * zaklepu lahko obstaja še po izteku (research.md §13).
 */
export async function check(key: string, now = new Date()): Promise<ThrottleVerdict> {
  const state = await readState(key);
  const l = limits();
  return {
    locked: isLocked(state, now),
    retryAfterSeconds: retryAfterSeconds(state, now),
    remaining: remainingAttempts(state, now, l),
  };
}

/** Preveri OBE meji hkrati (predmet ugibanja in izvorni naslov); prva izpolnjena zavrne. */
export async function checkPair(
  subjectKey: string,
  ip: string | undefined,
  now = new Date(),
): Promise<ThrottleVerdict> {
  const [bySubject, byIp] = await Promise.all([check(subjectKey, now), check(ipKey(ip), now)]);
  if (bySubject.locked || byIp.locked) {
    return {
      locked: true,
      retryAfterSeconds: Math.max(bySubject.retryAfterSeconds, byIp.retryAfterSeconds),
      remaining: 0,
    };
  }
  return { locked: false, retryAfterSeconds: 0, remaining: Math.min(bySubject.remaining, byIp.remaining) };
}

/** Geslo za PREVZEM datoteke. */
export function checkBoth(fileId: string, ip: string | undefined, now = new Date()): Promise<ThrottleVerdict> {
  return checkPair(linkKey(fileId), ip, now);
}

/** Koda za ODDAJO v predal (009b). */
export function checkInbox(inboxId: string, ip: string | undefined, now = new Date()): Promise<ThrottleVerdict> {
  return checkPair(inboxKey(inboxId), ip, now);
}

async function recordFailure(key: string, now: Date): Promise<AttemptState> {
  const l = limits();
  const next = registerFailure(await readState(key), now, l);
  // Zapis preživi okno IN morebiten zaklep — sicer bi ga TTL pobrisal med zaklepom in bi bil
  // zaklep s tem odpravljen.
  const expiresAt = new Date(now.getTime() + l.windowMs + l.lockMs);
  await FileShareAttemptModel.findOneAndUpdate(
    { key },
    { $set: { ...next, expiresAt } },
    { upsert: true, new: true },
  );
  return next;
}

/**
 * Zabeleži zgrešen poskus na OBEH ključih in vrne SKUPNI izid.
 *
 * Izid mora upoštevati oba števca, ne le povezave: ugibanje po mnogo povezavah z istega naslova
 * zaklene naslov, in prav ta zaklep mora biti viden že pri poskusu, ki ga je sprožil — sicer bi
 * napadalec z eno povezavo na naslov mejo obšel v celoti (research.md §9).
 */
export async function registerFailedPair(
  subjectKey: string,
  ip: string | undefined,
  now = new Date(),
): Promise<FailureVerdict> {
  const l = limits();
  const [subjectState, ipState] = await Promise.all([
    recordFailure(subjectKey, now),
    recordFailure(ipKey(ip), now),
  ]);
  const locked = isLocked(subjectState, now) || isLocked(ipState, now);
  return {
    locked,
    retryAfterSeconds: Math.max(retryAfterSeconds(subjectState, now), retryAfterSeconds(ipState, now)),
    remaining: Math.min(remainingAttempts(subjectState, now, l), remainingAttempts(ipState, now, l)),
    subjectLockedUntil: isLocked(subjectState, now) ? subjectState.lockedUntil : null,
  };
}

/** Zgrešeno geslo za PREVZEM datoteke. */
export function registerFailedAttempt(
  fileId: string,
  ip: string | undefined,
  now = new Date(),
): Promise<FailureVerdict> {
  return registerFailedPair(linkKey(fileId), ip, now);
}

/** Zgrešena koda za ODDAJO v predal (009b). */
export function registerFailedInboxAttempt(
  inboxId: string,
  ip: string | undefined,
  now = new Date(),
): Promise<FailureVerdict> {
  return registerFailedPair(inboxKey(inboxId), ip, now);
}

/**
 * Uspešna odklenitev ponastavi števec POVEZAVE.
 *
 * Števca naslova NE ponastavi: uspeh na eni povezavi ne sme oprati ugibanja, ki teče z istega
 * naslova po drugih povezavah — sicer bi napadalec z eno svojo veljavno povezavo lahko števec
 * poljubno pogosto brisal.
 */
export async function resetLink(fileId: string): Promise<void> {
  await FileShareAttemptModel.deleteOne({ key: linkKey(fileId) });
}

/** Isto za predal: uspešno vpisana koda počisti števec PREDALA, števca naslova pa ne (009b). */
export async function resetInbox(inboxId: string): Promise<void> {
  await FileShareAttemptModel.deleteOne({ key: inboxKey(inboxId) });
}
