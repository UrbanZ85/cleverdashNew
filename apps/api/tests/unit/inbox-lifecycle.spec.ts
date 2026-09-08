import { describe, expect, it } from 'vitest';
import {
  INBOX_STATES,
  canReissueCode,
  canTransition,
  isOpenForUpload,
} from '../../src/modules/file-sharing/domain/inbox-lifecycle.js';
import { sanitizeSenderName } from '../../src/modules/file-sharing/domain/sender-name.js';
import { isStreamableBody } from '../../src/modules/file-sharing/domain/body-type.js';

// Stanja, rok in vhodne varovalke sprejemnega predala (009b). Čiste funkcije, brez baze in brez
// ure — `now` je vedno argument (člen IX).

const NOW = new Date('2026-09-08T10:00:00.000Z');

describe('stanja predala', () => {
  it('nabor je natanko `open` in `closed` — `broken` tu ne obstaja', () => {
    // Pri datoteki je `broken` ugotovitev o razhajanju med zapisom in vsebino na disku. Predal
    // vsebine nima, zato tako stanje zanj ni izrazljivo in ne sme biti.
    expect([...INBOX_STATES]).toEqual(['open', 'closed']);
  });

  it('odprt predal se sme zapreti', () => {
    expect(canTransition('open', 'closed')).toBe(true);
  });

  it('`closed → open` NI dovoljen prehod — zaprtje se ne "odklene"', () => {
    // Edina pot nazaj v obtok je izdaja NOVE kode, kar je druga operacija z drugimi posledicami
    // (nov naslov, razveljavljene dovolilnice). Sicer bi stari kodi podaljšali življenje.
    expect(canTransition('closed', 'open')).toBe(false);
  });

  it('dvakratno zaprtje ni prehod', () => {
    expect(canTransition('closed', 'closed')).toBe(false);
  });

  it('novo kodo je mogoče izdati v vsakem stanju — prav to vrne predal v obtok', () => {
    expect(canReissueCode('open')).toBe(true);
    expect(canReissueCode('closed')).toBe(true);
  });
});

describe('isOpenForUpload — sme predal sprejeti oddajo', () => {
  it('odprt in brez roka sprejema', () => {
    expect(isOpenForUpload({ state: 'open', expiresAt: null }, NOW)).toBe(true);
  });

  it('odprt z rokom v prihodnosti sprejema', () => {
    expect(isOpenForUpload({ state: 'open', expiresAt: new Date(NOW.getTime() + 1000) }, NOW)).toBe(true);
  });

  it('potekel ne sprejema, čeprav je stanje še `open`', () => {
    // "Poteklo" ni shranjeno stanje: brez tega izračuna bi predal po roku še sprejemal, dokler
    // ga ne bi kdo posebej zaprl.
    expect(isOpenForUpload({ state: 'open', expiresAt: new Date(NOW.getTime() - 1) }, NOW)).toBe(false);
  });

  it('natanko ob roku ne sprejema več', () => {
    expect(isOpenForUpload({ state: 'open', expiresAt: NOW }, NOW)).toBe(false);
  });

  it('zaprt ne sprejema, tudi če rok še ni minil', () => {
    expect(isOpenForUpload({ state: 'closed', expiresAt: new Date(NOW.getTime() + 100000) }, NOW)).toBe(false);
  });
});

describe('sanitizeSenderName — edini prosti vnos od nekoga brez računa (FR-092)', () => {
  it('ohrani navadno ime', () => {
    expect(sanitizeSenderName('Janez Novak')).toBe('Janez Novak');
  });

  it('odstrani znak za novo vrstico — v dnevniku ali glavi bi bil vbrizg', () => {
    expect(sanitizeSenderName('Janez\r\nX-Injected: 1')).toBe('JanezX-Injected: 1');
  });

  it('niz iz samih nevidnih znakov postane `null`, ne prazna vrstica na seznamu', () => {
    expect(sanitizeSenderName('\u200B\u200B\uFEFF')).toBeNull();
  });

  it('izpuščeno polje in vnos, od katerega ne ostane nič, sta neločljiva', () => {
    expect(sanitizeSenderName(undefined)).toBeNull();
    expect(sanitizeSenderName('   ')).toBeNull();
  });

  it('skrajša predolgo navedbo na 80 znakov', () => {
    expect(sanitizeSenderName('a'.repeat(200))).toHaveLength(80);
  });

  it('strne zaporedne presledke', () => {
    expect(sanitizeSenderName('  Janez     Novak  ')).toBe('Janez Novak');
  });
});

describe('isStreamableBody — telo, ki ga nekdo drug požre ali ki bi se shranilo kot smet', () => {
  it('surova vsebina je v redu', () => {
    expect(isStreamableBody('application/octet-stream')).toBe(true);
    expect(isStreamableBody('image/png')).toBe(true);
    expect(isStreamableBody('application/pdf')).toBe(true);
  });

  it('odsotna glava je DOVOLJENA — telo brez napovedi vrste je surovo telo', () => {
    expect(isStreamableBody(undefined)).toBe(true);
    expect(isStreamableBody(null)).toBe(true);
    expect(isStreamableBody('')).toBe(true);
  });

  it('`application/json` je zavrnjen — požre ga globalni razčlenjevalnik in datoteka bi bila prazna', () => {
    expect(isStreamableBody('application/json')).toBe(false);
    expect(isStreamableBody('application/json; charset=utf-8')).toBe(false);
    expect(isStreamableBody('APPLICATION/JSON')).toBe(false);
  });

  it('obrazci so zavrnjeni — na disk bi se zapisale meje obrazca skupaj z vsebino', () => {
    expect(isStreamableBody('multipart/form-data; boundary=----x')).toBe(false);
    expect(isStreamableBody('application/x-www-form-urlencoded')).toBe(false);
  });
});
