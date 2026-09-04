import { describe, expect, it } from 'vitest';
import {
  compareSlovenian,
  initialsOf,
  maskEmail,
} from '../../src/platform/users/user-directory.js';

// FR-071, FR-072. `maskEmail` je varnostno pomembna funkcija: če kdaj vrne cel naslov, dobi
// vsak prijavljen uporabnik uporaben seznam naslovov cele namestitve. Zadnji test v tem
// razdelku je zato zapisan kot lastnost ("nikoli ne vrne celega naslova"), ne kot primer.

describe('maskEmail', () => {
  it('običajen naslov zamaskira na prvo in zadnjo črko lokalnega dela', () => {
    expect(maskEmail('janez.novak@agenda.si')).toBe('j…k@agenda.si');
  });

  it('domena ostane cela — je last organizacije, ne osebe, in loči službeni naslov od zasebnega', () => {
    expect(maskEmail('janez@sub.agenda.si')).toBe('j…z@sub.agenda.si');
  });

  it('dvočrkovni lokalni del zamaskira brez izgube oblike', () => {
    expect(maskEmail('ab@x.si')).toBe('a…b@x.si');
  });

  it('enočrkovni lokalni del nima česa skriti in ne razpade', () => {
    expect(maskEmail('a@agenda.si')).toBe('a…@agenda.si');
  });

  it('šumniki v naslovu ne razbijejo maske', () => {
    expect(maskEmail('čebela@agenda.si')).toBe('č…a@agenda.si');
  });

  it('naslov z več afnami se maskira po ZADNJI — ta loči domeno', () => {
    expect(maskEmail('cudno@ime@agenda.si')).toBe('c…e@agenda.si');
  });

  it('kar ni naslov, da prazen niz — nikoli izvirnika', () => {
    // Neznana oblika je zadnje mesto, kjer bi smeli ugibati in kaj spustiti skozi.
    expect(maskEmail('brez-afne')).toBe('');
    expect(maskEmail('@samo-domena.si')).toBe('');
    expect(maskEmail('brez-domene@')).toBe('');
    expect(maskEmail('')).toBe('');
  });

  it('LASTNOST: rezultat nikoli ne vsebuje celega lokalnega dela, kadar je ta daljši od dveh', () => {
    const primeri = [
      'janez.novak@agenda.si',
      'urban@agenda.si',
      'a.very.long.address@example.com',
      'ČEBELA@agenda.si',
    ];
    for (const email of primeri) {
      const local = email.slice(0, email.lastIndexOf('@'));
      expect(maskEmail(email), `naslov ${email}`).not.toContain(local);
    }
  });
});

describe('initialsOf', () => {
  it('ime in priimek dasta dve začetnici', () => {
    expect(initialsOf('Janez Novak')).toBe('JN');
  });

  it('eno samo ime da eno začetnico', () => {
    expect(initialsOf('Janez')).toBe('J');
  });

  it('pri treh delih vzame PRVEGA in ZADNJEGA, ne prvih dveh', () => {
    expect(initialsOf('Ana Marija Novak')).toBe('AN');
  });

  it('šumniki se pravilno povečajo', () => {
    expect(initialsOf('čebela žaba')).toBe('ČŽ');
  });

  it('odvečni presledki ne ustvarijo praznih začetnic', () => {
    expect(initialsOf('   Janez    Novak   ')).toBe('JN');
  });

  it('prazno ime da prazen niz, ne vrže', () => {
    expect(initialsOf('')).toBe('');
    expect(initialsOf('   ')).toBe('');
  });

  it('nikoli ne vrne več kot dveh znakov', () => {
    expect(initialsOf('Ana Bea Cita Dora Eva').length).toBeLessThanOrEqual(2);
  });
});

describe('compareSlovenian', () => {
  it('Č se uvrsti med C in D, ne za Z', () => {
    // Dvojiška primerjava postavi Č za Z; v spustnem seznamu imen je to videti kot napaka.
    expect(compareSlovenian('Cvetka', 'Čebela')).toBeLessThan(0);
    expect(compareSlovenian('Čebela', 'Dora')).toBeLessThan(0);
    expect(compareSlovenian('Čebela', 'Zala')).toBeLessThan(0);
  });

  it('Š in Ž sta prav tako na svojem mestu', () => {
    expect(compareSlovenian('Sara', 'Špela')).toBeLessThan(0);
    expect(compareSlovenian('Špela', 'Tina')).toBeLessThan(0);
    expect(compareSlovenian('Zala', 'Žan')).toBeLessThan(0);
  });

  it('razvrsti seznam imen po slovensko', () => {
    const imena = ['Žan', 'Ana', 'Špela', 'Cvetka', 'Čebela'];
    expect([...imena].sort(compareSlovenian)).toEqual([
      'Ana',
      'Cvetka',
      'Čebela',
      'Špela',
      'Žan',
    ]);
  });
});
