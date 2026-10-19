import { describe, expect, it } from 'vitest';
import {
  AI_MAX_IMAGES,
  AI_OUTPUT_JSON_SCHEMA,
  aiInputHash,
  buildAiRequest,
  buildInstructions,
  canonicalAiInput,
  extractAiOutputText,
  normalizeAttributeKey,
  parseAiOutput,
  serializeAiInput,
  toAnalysis,
  truncateAiInput,
} from '../../../src/platform/scanner/domain/ai-analysis.js';
import { AI_ANALYSIS_VERSION } from '../../../src/platform/scanner/types.js';

// 017, člen IX: čista domena analize z umetno inteligenco — vhod, hash, navodilo, shema, odgovor.

const base = { title: 'Golf 1.9 TDI', description: 'Lepo ohranjen.', source: 'avtonet', url: 'https://example.test/1', price: { amount: 2500, currency: 'EUR' } };

describe('kanonični vhod in hash (FR-008, FR-013)', () => {
  it('ureja ključe lastnosti, jih poenoti v snake_case in izpusti undefined; slike samo https in največ 3', () => {
    const input = canonicalAiInput(
      { ...base, attributes: { Letnik: 2008, 'Prevoženi km': '180.000', nothing: undefined as unknown as null, 'camelCaseKey': true }, images: ['http://x/1.jpg', 'https://x/2.jpg', 'ftp://x', 'https://x/3.jpg', 'https://x/4.jpg', 'https://x/5.jpg'] },
      { images: true },
    );
    expect(Object.keys(input.attributes)).toEqual(['camel_case_key', 'letnik', 'prevozeni_km']);
    expect(input.images).toHaveLength(AI_MAX_IMAGES);
    expect(input.images.every((u) => u.startsWith('https://'))).toBe(true);
    expect(canonicalAiInput({ ...base, images: ['https://x/2.jpg'] }, { images: false }).images).toEqual([]);
  });

  it('isti vhod v drugem vrstnem redu da isti hash; drug model ali drug vhod da drugega', () => {
    const a = canonicalAiInput({ ...base, attributes: { b: 1, a: 2 } }, { images: false });
    const b = canonicalAiInput({ ...base, attributes: { a: 2, b: 1 } }, { images: false });
    expect(serializeAiInput(a)).toBe(serializeAiInput(b));
    expect(aiInputHash('m', a)).toBe(aiInputHash('m', b));
    expect(aiInputHash('m', a)).toMatch(/^[0-9a-f]{32}$/);
    expect(aiInputHash('m2', a)).not.toBe(aiInputHash('m', a));
    expect(aiInputHash('m', { ...a, title: 'drugo' })).not.toBe(aiInputHash('m', a));
    expect(aiInputHash('m', a, AI_ANALYSIS_VERSION + 1)).not.toBe(aiInputHash('m', a));
  });

  it('odrez je determinističen: najprej opis, nato lastnosti od zadnje; pod mejo ne spremeni nič', () => {
    const long = canonicalAiInput({ ...base, description: 'x'.repeat(5000), attributes: { a: 'y'.repeat(400), b: 'z'.repeat(400), c: 'w'.repeat(400) } }, { images: false });
    const cut = truncateAiInput(long, 1200);
    expect(serializeAiInput(cut).length).toBeLessThanOrEqual(1200);
    expect(cut.description?.endsWith('…')).toBe(true);
    expect(Object.keys(cut.attributes)).toEqual(['a']); // b in c odpadeta od zadnje naprej
    expect(truncateAiInput(cut, 1200)).toEqual(cut);
    const small = canonicalAiInput(base, { images: false });
    expect(truncateAiInput(small, 10_000)).toBe(small);
  });

  it('normalizeAttributeKey: šumniki, presledki, $ in pike → snake_case brez robnih podčrtajev', () => {
    expect(normalizeAttributeKey('Moč motorja (kW)')).toBe('moc_motorja_kw');
    expect(normalizeAttributeKey('$set.x')).toBe('set_x');
    expect(normalizeAttributeKey('___')).toBe('attr');
  });
});

describe('navodilo in zahteva (FR-003, FR-009)', () => {
  it('navodilo prepove izmišljanje cen, stroškov in dobičkov ter zahteva slovenščino; predmet tipa je vključen', () => {
    const text = buildInstructions('letalsko ponudbo');
    expect(text).toContain('letalsko ponudbo');
    expect(text).toMatch(/NIKOLI ne izmišljaj/);
    expect(text).toMatch(/stroškov popravil/);
    expect(text).toMatch(/dobičkov/);
    expect(text).toContain('slovenščini');
    expect(buildInstructions(undefined)).toContain('rezultat skenerja');
  });

  it('shema izhoda: vsa polja obvezna, brez dodatnih ključev, brez številskih polj; zahteva je strict json_schema s store: false', () => {
    const schema = AI_OUTPUT_JSON_SCHEMA;
    expect(schema.additionalProperties).toBe(false);
    expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
    expect(Object.values(schema.properties).some((p) => (p as { type: string }).type === 'number' || (p as { type: string }).type === 'integer')).toBe(false);
    const req = buildAiRequest({ model: 'gpt-6.1-sol', input: canonicalAiInput({ ...base, images: ['https://x/1.jpg'] }, { images: true }), subject: undefined });
    expect(req.model).toBe('gpt-6.1-sol');
    expect(req.store).toBe(false);
    expect(req.text.format).toMatchObject({ type: 'json_schema', strict: true, name: 'scanner_result_analysis' });
    expect(req.input[0]?.content[0]).toMatchObject({ type: 'input_text' });
    expect(req.input[0]?.content[1]).toEqual({ type: 'input_image', image_url: 'https://x/1.jpg', detail: 'low' });
    // Slike NISO v besedilnem delu (gredo kot ločen vhod), naslov in cena so.
    const text = (req.input[0]?.content[0] as { text: string }).text;
    expect(text).not.toContain('"images"');
    expect(text).toContain('Golf 1.9 TDI');
    expect(text).toContain('2500');
  });
});

describe('odgovor modela (FR-009, US2.3)', () => {
  const valid = {
    summary: 'Solidna ponudba.',
    riskLevel: 'medium',
    explanation: 'Opis je kratek.',
    risks: ['Brez servisne knjige'],
    defects: [],
    opportunities: ['Nizka cena za letnik'],
    attributes: [{ key: 'Year', value: '2008' }, { key: 'year', value: '2009' }, { key: 'engine', value: '' }],
    confidence: 'low',
  };

  it('veljaven JSON po shemi → analiza z zemljevidom lastnosti (prvi ključ zmaga, prazne vrednosti odpadejo)', () => {
    const parsed = parseAiOutput(JSON.stringify(valid));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const analysis = toAnalysis(parsed.output, { model: 'm', analyzedAt: new Date('2026-10-19T10:00:00Z'), inputHash: 'h', cached: false });
    expect(analysis).toMatchObject({ version: 1, model: 'm', inputHash: 'h', cached: false, riskLevel: 'medium', confidence: 'low', attributes: { year: '2008' } });
  });

  it('neveljaven JSON, manjkajoče polje, dodatno polje ali napačna vrednost → neuspeh z razlogom, nikoli delna analiza', () => {
    expect(parseAiOutput('{ni json')).toMatchObject({ ok: false, reason: 'invalid-json' });
    const { confidence: _c, ...missing } = valid;
    expect(parseAiOutput(JSON.stringify(missing))).toMatchObject({ ok: false, reason: 'invalid-shape' });
    expect(parseAiOutput(JSON.stringify({ ...valid, estimatedPrice: 3000 }))).toMatchObject({ ok: false, reason: 'invalid-shape' });
    expect(parseAiOutput(JSON.stringify({ ...valid, riskLevel: 'extreme' }))).toMatchObject({ ok: false, reason: 'invalid-shape' });
  });

  it('extractAiOutputText: output_text se združi; refusal, incomplete, prazno in napačna oblika so neuspehi; usage se prebere', () => {
    const ok = extractAiOutputText({ status: 'completed', output: [{ type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: '{"a":' }, { type: 'output_text', text: '1}' }] }], usage: { input_tokens: 10, output_tokens: 5 } });
    expect(ok).toEqual({ ok: true, text: '{"a":1}', usage: { inputTokens: 10, outputTokens: 5 } });
    expect(extractAiOutputText({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'ne' }] }] })).toMatchObject({ ok: false, reason: 'refusal' });
    expect(extractAiOutputText({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] })).toMatchObject({ ok: false, reason: 'incomplete' });
    expect(extractAiOutputText({ status: 'completed', output: [] })).toMatchObject({ ok: false, reason: 'empty' });
    expect(extractAiOutputText('x')).toMatchObject({ ok: false, reason: 'malformed' });
  });
});
