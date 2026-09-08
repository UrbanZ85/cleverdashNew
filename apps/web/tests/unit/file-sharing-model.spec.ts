import { describe, expect, it } from 'vitest';
import {
  EXPIRY_OPTIONS,
  acceptsUploads,
  describeDropCapacity,
  describeExpiry,
  describeInboxState,
  describeQuota,
  describeReceivedAt,
  describeSource,
  describeState,
  fileCountChoices,
  formatBytes,
  hasGuessingWarning,
  inboxHasGuessingWarning,
  isReceived,
  isShareable,
  quotaRatio,
  totalMbChoices,
} from '../../src/app/features/file-sharing/file-sharing.model.js';

// Čista logika modula deljenja datotek — teče brez TestBed-a (isti vzorec kot notes-model.spec.ts).

describe('formatBytes', () => {
  it('izbere enoto glede na velikost', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 kB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    // 500 MB je meja te funkcionalnosti in mora biti berljiva.
    expect(formatBytes(500 * 1024 * 1024)).toBe('500.0 MB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.00 GB');
  });

  it('nesmiselna vrednost ne izriše "NaN B"', () => {
    expect(formatBytes(Number.NaN)).toBe('—');
    expect(formatBytes(-1)).toBe('—');
  });
});

describe('describeState', () => {
  it('pokvarjeno je pomembnejše od preklicanega, preklicano od poteklega', () => {
    // Uporabnik, ki je povezavo preklical IN ji je medtem potekel rok, mora videti, da jo je
    // PREKLICAL — to je njegovo dejanje, ne posledica časa.
    expect(describeState({ state: 'broken', expired: true })).toContain('Pokvarjeno');
    expect(describeState({ state: 'revoked', expired: true })).toBe('Preklicano');
    expect(describeState({ state: 'ready', expired: true })).toBe('Poteklo');
    expect(describeState({ state: 'ready', expired: false })).toBe('Na voljo');
    expect(describeState({ state: 'uploading', expired: false })).toBe('Se nalaga');
  });
});

describe('isShareable', () => {
  it('deljiva je samo pripravljena in neposkočena datoteka', () => {
    expect(isShareable({ state: 'ready', expired: false })).toBe(true);
    expect(isShareable({ state: 'ready', expired: true })).toBe(false);
    expect(isShareable({ state: 'revoked', expired: false })).toBe(false);
    expect(isShareable({ state: 'broken', expired: false })).toBe(false);
    expect(isShareable({ state: 'uploading', expired: false })).toBe(false);
  });
});

describe('describeExpiry', () => {
  const now = new Date('2026-09-02T10:00:00.000Z');

  it('BREZ ROKA je izrecno označeno — ne prazno polje', () => {
    // Pozabljene povezave brez roka so razlog, da rok sploh obstaja (US4 scenarij 3).
    expect(describeExpiry(null, now)).toBe('Brez roka');
  });

  it('šteje dneve in ure', () => {
    expect(describeExpiry(new Date(now.getTime() + 3 * 24 * 3600_000).toISOString(), now)).toBe('Še 3 dni');
    expect(describeExpiry(new Date(now.getTime() + 2 * 24 * 3600_000).toISOString(), now)).toBe('Še 2 dneva');
    expect(describeExpiry(new Date(now.getTime() + 5 * 3600_000).toISOString(), now)).toBe('Še 5 ur');
    expect(describeExpiry(new Date(now.getTime() + 2 * 3600_000).toISOString(), now)).toBe('Še 2 uri');
  });

  it('pretekli rok je poteklo, ne negativno število', () => {
    expect(describeExpiry(new Date(now.getTime() - 1000).toISOString(), now)).toBe('Poteklo');
    expect(describeExpiry(now.toISOString(), now)).toBe('Poteklo');
  });
});

describe('hasGuessingWarning', () => {
  const now = new Date('2026-09-02T10:00:00.000Z');

  it('opozori ob neuspelih poskusih in ob zaklepu (FR-033)', () => {
    expect(hasGuessingWarning({ failedAttempts: 0, lockedUntil: null }, now)).toBe(false);
    expect(hasGuessingWarning({ failedAttempts: 1, lockedUntil: null }, now)).toBe(true);
    expect(
      hasGuessingWarning({ failedAttempts: 0, lockedUntil: new Date(now.getTime() + 60_000).toISOString() }, now),
    ).toBe(true);
  });

  it('potekel zaklep ni več opozorilo', () => {
    expect(
      hasGuessingWarning({ failedAttempts: 0, lockedUntil: new Date(now.getTime() - 60_000).toISOString() }, now),
    ).toBe(false);
  });
});

describe('kvota', () => {
  it('opiše zasedenost v berljivih enotah', () => {
    expect(describeQuota({ usedBytes: 1024 * 1024, limitBytes: 10 * 1024 * 1024 })).toBe('1.0 MB od 10.0 MB');
  });

  it('delež nikoli ne uide iz [0, 1] — znižana kvota ne sme izrisati črte čez rob', () => {
    expect(quotaRatio({ usedBytes: 0, limitBytes: 100 })).toBe(0);
    expect(quotaRatio({ usedBytes: 50, limitBytes: 100 })).toBe(0.5);
    expect(quotaRatio({ usedBytes: 500, limitBytes: 100 })).toBe(1);
    expect(quotaRatio({ usedBytes: 5, limitBytes: 0 })).toBe(1);
  });
});

describe('EXPIRY_OPTIONS', () => {
  it('vsebuje izbiro BREZ ROKA kot vrednost null, ne kot odsotnost', () => {
    // `undefined` (nisem izbral) in `null` (izbral sem brez roka) morata biti ločena vse do
    // strežnika — sicer je "brez roka" neizrazljivo.
    const values = EXPIRY_OPTIONS.map((o) => o.value);
    expect(values).toEqual([1, 7, 30, null]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
//  009b — sprejemni predali (obrnjena smer)
// ═══════════════════════════════════════════════════════════════════════════════════════════

const INBOX = {
  state: 'open' as const,
  expired: false,
  openForUpload: true,
  receivedFiles: 1,
  maxFiles: 3,
  receivedBytes: 2 * 1024 * 1024,
  maxTotalBytes: 10 * 1024 * 1024,
  remainingFiles: 2,
  remainingBytes: 8 * 1024 * 1024,
  failedAttempts: 0,
  lockedUntil: null,
};

describe('describeInboxState', () => {
  it('zaprtje je pomembnejše od poteka, potek od polnosti', () => {
    // Lastnikovo dejanje pred posledico časa, oboje pred stanjem, ki ga je mogoče popraviti z
    // brisanjem — isto pravilo kot pri `describeState` za datoteko.
    expect(describeInboxState({ ...INBOX, state: 'closed', expired: true, remainingFiles: 0, remainingBytes: 0 })).toBe(
      'Zaprt',
    );
    expect(describeInboxState({ ...INBOX, expired: true, remainingFiles: 0, remainingBytes: 0 })).toBe('Poteklo');
    expect(describeInboxState({ ...INBOX, remainingFiles: 0 })).toBe('Poln');
    expect(describeInboxState({ ...INBOX, remainingBytes: 0 })).toBe('Poln');
    expect(describeInboxState(INBOX)).toBe('Sprejema');
  });
});

describe('acceptsUploads', () => {
  it('zahteva odprtost IN prostor — `openForUpload` s strežnika prostora ne pozna', () => {
    expect(acceptsUploads(INBOX)).toBe(true);
    expect(acceptsUploads({ ...INBOX, openForUpload: false })).toBe(false);
    expect(acceptsUploads({ ...INBOX, remainingFiles: 0 })).toBe(false);
    expect(acceptsUploads({ ...INBOX, remainingBytes: 0 })).toBe(false);
  });
});

describe('describeDropCapacity', () => {
  it('pove pošiljatelju, koliko sme še oddati', () => {
    expect(describeDropCapacity({ remainingFiles: 2, remainingBytes: 8 * 1024 * 1024 })).toContain('2 datotek');
    expect(describeDropCapacity({ remainingFiles: 1, remainingBytes: 1024 })).toContain('1 datoteko');
  });

  it('polni predal pove, da je poln, in ne "0 datotek"', () => {
    expect(describeDropCapacity({ remainingFiles: 0, remainingBytes: 1024 })).toBe('Predal je poln.');
    expect(describeDropCapacity({ remainingFiles: 2, remainingBytes: 0 })).toBe('Predal je poln.');
  });
});

describe('izvor datoteke', () => {
  it('prejeta datoteka je označena kot prejeta, z navedbo pošiljatelja, če jo je dal', () => {
    expect(isReceived({ origin: 'inbox' })).toBe(true);
    expect(isReceived({ origin: 'owner' })).toBe(false);
    expect(describeSource({ origin: 'inbox', senderName: 'Janez' })).toBe('Prejeto — oddal: Janez');
    expect(describeSource({ origin: 'inbox', senderName: null })).toBe('Prejeto prek povezave za oddajo');
  });

  it('pri lastni datoteki ni ničesar za povedati', () => {
    expect(describeSource({ origin: 'owner', senderName: null })).toBeNull();
    // Tudi če bi strežnik kdaj poslal navedbo pri lastni datoteki, je izvor tisti, ki odloča.
    expect(describeSource({ origin: 'owner', senderName: 'Janez' })).toBeNull();
  });
});

describe('inboxHasGuessingWarning', () => {
  const now = new Date('2026-09-08T10:00:00.000Z');

  it('opozori ob vsakem zgrešenem poskusu in med zaklepom', () => {
    expect(inboxHasGuessingWarning({ failedAttempts: 1, lockedUntil: null }, now)).toBe(true);
    expect(
      inboxHasGuessingWarning({ failedAttempts: 0, lockedUntil: '2026-09-08T11:00:00.000Z' }, now),
    ).toBe(true);
  });

  it('minuli zaklep brez zgrešenih poskusov ni več opozorilo', () => {
    expect(inboxHasGuessingWarning({ failedAttempts: 0, lockedUntil: '2026-09-08T09:00:00.000Z' }, now)).toBe(false);
    expect(inboxHasGuessingWarning({ failedAttempts: 0, lockedUntil: null }, now)).toBe(false);
  });
});

describe('izbire mej predala', () => {
  it('ne ponudijo vrednosti nad stropom namestitve — izbira, ki bo zavrnjena, ni izbira', () => {
    expect(fileCountChoices({ maxFiles: 5 })).toEqual([1, 3, 5]);
    expect(totalMbChoices({ maxTotalBytes: 100 * 1024 * 1024 })).toEqual([50, 100]);
  });

  it('strop je vedno med izbirami, tudi kadar ni med predlogami', () => {
    // Namestitev z nenavadno mejo (7 datotek, 300 MB) ne sme pustiti uporabnika brez možnosti,
    // da izbere ves prostor, ki mu je na voljo.
    expect(fileCountChoices({ maxFiles: 7 })).toEqual([1, 3, 5, 7]);
    expect(totalMbChoices({ maxTotalBytes: 300 * 1024 * 1024 })).toEqual([50, 100, 300]);
  });

  it('zelo majhen strop pusti vsaj eno izbiro', () => {
    expect(fileCountChoices({ maxFiles: 1 })).toEqual([1]);
    expect(totalMbChoices({ maxTotalBytes: 10 * 1024 * 1024 })).toEqual([10]);
  });
});

describe('describeReceivedAt', () => {
  it('brez oddaje pove, da še ni nič oddanega', () => {
    expect(describeReceivedAt(null)).toBe('Še nič oddanega.');
  });

  it('čas je ljubljanski, ne v coni naprave (člen V.4)', () => {
    // 8. 9. 2026 v poletnem času: 08:30 UTC je 10:30 v Ljubljani.
    const text = describeReceivedAt('2026-09-08T08:30:00.000Z');
    expect(text).toContain('10:30');
  });
});
