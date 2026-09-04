import { describe, expect, it } from 'vitest';
import { validateCommuteSettings } from '../../src/modules/settings/services/commute-settings.service.js';

// Kraja ploščice "Pot" v `Settings.commute`. Pomen `undefined` (ne spreminjaj) proti `null`
// (izprazni) je isti kot pri `validateSourceOverrides` — in prav ta razlika je tisto, kar
// preprečuje, da bi shranjevanje enega kraja pobrisalo drugega.

describe('validateCommutePlaces', () => {
  it('obreže ime in naslov', () => {
    const result = validateCommuteSettings({ home: { label: '  Doma  ', address: '  Kranj 1  ' } });
    expect(result.home).toEqual({ label: 'Doma', address: 'Kranj 1' });
  });

  it('kraja, ki ga zahteva ne navede, ne spremeni', () => {
    const result = validateCommuteSettings({ work: { label: 'Pisarna' } });
    expect(Object.keys(result)).toEqual(['work']);
    expect('home' in result).toBe(false);
  });

  it('polja, ki ga zahteva ne navede, ne spremeni', () => {
    // Samo ime — naslov in koordinati ostanejo shranjeni.
    const result = validateCommuteSettings({ home: { label: 'Vikend' } });
    expect(result.home).toEqual({ label: 'Vikend' });
  });

  it('prazno ime se vrne na privzeto, da oznaka nad zemljevidom ni prazna', () => {
    expect(validateCommuteSettings({ home: { label: '' } }).home?.label).toBe('Doma');
    expect(validateCommuteSettings({ work: { label: null } }).work?.label).toBe('Služba');
  });

  it('prazen naslov pomeni "ni naslova"', () => {
    expect(validateCommuteSettings({ home: { address: '   ' } }).home?.address).toBeNull();
    expect(validateCommuteSettings({ work: { address: null } }).work?.address).toBeNull();
  });

  it('sprejme koordinati kot par', () => {
    const result = validateCommuteSettings({ home: { latitude: 46.062382, longitude: 14.560178 } });
    expect(result.home).toEqual({ latitude: 46.062382, longitude: 14.560178 });
  });

  it('izprazni koordinati, kadar sta obe null', () => {
    const result = validateCommuteSettings({ work: { latitude: null, longitude: null } });
    expect(result.work).toEqual({ latitude: null, longitude: null });
  });

  it('zavrne samo eno koordinato — polovica para je neuporaben kraj', () => {
    expect(() => validateCommuteSettings({ home: { latitude: 46.1 } })).toThrowError(/skupaj/);
    expect(() => validateCommuteSettings({ home: { longitude: 14.5 } })).toThrowError(/skupaj/);
    expect(() => validateCommuteSettings({ home: { latitude: 46.1, longitude: null } })).toThrowError(/skupaj/);
  });

  it('zavrne koordinati izven mej in imenuje kraj', () => {
    expect(() => validateCommuteSettings({ home: { latitude: 91, longitude: 14 } })).toThrowError(/Kraj “doma”/);
    expect(() => validateCommuteSettings({ work: { latitude: 46, longitude: 181 } })).toThrowError(/Kraj “služba”/);
  });

  it('zavrne predolgo ime in predolg naslov', () => {
    expect(() => validateCommuteSettings({ home: { label: 'x'.repeat(41) } })).toThrowError(/40 znakov/);
    expect(() => validateCommuteSettings({ home: { address: 'x'.repeat(201) } })).toThrowError(/200 znakov/);
  });

  it('nepopoln kraj (samo ime) je dovoljen — ploščica pove, da pot ni nastavljena', () => {
    // Zavrnitev bi uporabnika pustila brez poti naprej: ime brez naslova je normalno stanje
    // med vnašanjem.
    expect(() => validateCommuteSettings({ home: { label: 'Doma' } })).not.toThrow();
  });
});

describe('validateCommuteSettings — videz ploščice', () => {
  it('sprejme višino zemljevida in postavitev', () => {
    const result = validateCommuteSettings({ mapHeightPx: 260, layout: 'horizontal' });
    expect(result).toEqual({ mapHeightPx: 260, layout: 'horizontal' });
  });

  it('zaokroži decimalno višino', () => {
    expect(validateCommuteSettings({ mapHeightPx: 199.6 }).mapHeightPx).toBe(200);
  });

  it('null pomeni "vrni na privzeto"', () => {
    expect(validateCommuteSettings({ mapHeightPx: null }).mapHeightPx).toBe(170);
    expect(validateCommuteSettings({ layout: null }).layout).toBe('vertical');
  });

  it.each([99, 601, 0, -10, Number.NaN])('zavrne višino izven mej (%s) in je NE obreže tiho', (height) => {
    // Tiho obrezovanje bi pomenilo, da uporabnik vpiše 2000 in dobi 600 brez besede.
    expect(() => validateCommuteSettings({ mapHeightPx: height })).toThrowError(/med 100 in 600/);
  });

  it('zavrne neznano postavitev', () => {
    expect(() =>
      validateCommuteSettings({ layout: 'diagonalno' as unknown as 'vertical' }),
    ).toThrowError(/vertical/);
  });

  it('videza ne spremeni, kadar ga zahteva ne navede', () => {
    const result = validateCommuteSettings({ home: { label: 'Doma' } });
    expect('mapHeightPx' in result).toBe(false);
    expect('layout' in result).toBe(false);
  });
});
