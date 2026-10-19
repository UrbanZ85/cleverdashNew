import { describe, expect, it } from 'vitest';
import {
  adminTriggerSchema,
  definitionCreateSchema,
  definitionPatchSchema,
  resultsQuerySchema,
} from '../../../src/platform/scanner/domain/definition-input.js';

// FR-005, FR-006: ovojnica skenerja; `config` je samo JSON.

describe('definitionCreateSchema', () => {
  it('sprejme minimalen vnos s privzetki', () => {
    const parsed = definitionCreateSchema.parse({ name: ' Echo ', type: 'echo', config: { items: 3 } });
    expect(parsed).toMatchObject({ name: 'Echo', enabled: true, schedule: {}, notifications: {}, config: { items: 3 } });
  });
  it('zavrne prazno ime in predolgo ime s slovenskim sporočilom', () => {
    expect(() => definitionCreateSchema.parse({ name: '', type: 'echo', config: {} })).toThrowError(/obvezno/);
    expect(() => definitionCreateSchema.parse({ name: 'x'.repeat(81), type: 'echo', config: {} })).toThrowError(/80/);
  });
  it('config sprejme samo JSON: funkcije in razredi so zavrnjeni, gnezdenje je dovoljeno', () => {
    expect(() => definitionCreateSchema.parse({ name: 'a', type: 'echo', config: { fn: () => 1 } })).toThrow();
    expect(() => definitionCreateSchema.parse({ name: 'a', type: 'echo', config: { d: new Date() } })).toThrow();
    expect(definitionCreateSchema.parse({ name: 'a', type: 'echo', config: { a: [1, { b: null }], c: 'x' } }).config).toEqual({ a: [1, { b: null }], c: 'x' });
  });
});

describe('definitionPatchSchema', () => {
  it('prazen patch je zavrnjen', () => {
    expect(() => definitionPatchSchema.parse({})).toThrowError(/Vsaj eno polje/);
  });
  it('delni patch urnika je sprejet', () => {
    expect(definitionPatchSchema.parse({ schedule: { preset: 'hourly' } })).toEqual({ schedule: { preset: 'hourly' } });
  });
});

describe('poizvedbe', () => {
  it('resultsQuerySchema: privzetki in pretvorba includeUnavailable', () => {
    expect(resultsQuerySchema.parse({})).toEqual({ sort: 'seen', includeUnavailable: false, limit: 100 });
    expect(resultsQuerySchema.parse({ includeUnavailable: 'true', limit: '5', sort: 'price' })).toEqual({ sort: 'price', includeUnavailable: true, limit: 5 });
    expect(() => resultsQuerySchema.parse({ limit: '501' })).toThrow();
  });
  it('adminTriggerSchema zahteva natanko eno od type ali scannerId', () => {
    expect(adminTriggerSchema.parse({ type: 'flights' })).toEqual({ type: 'flights' });
    expect(() => adminTriggerSchema.parse({})).toThrowError(/natanko eno/);
    expect(() => adminTriggerSchema.parse({ type: 'flights', scannerId: 'x' })).toThrowError(/natanko eno/);
  });
});
