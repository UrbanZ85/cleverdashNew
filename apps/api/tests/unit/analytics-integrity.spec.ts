import { describe, expect, it } from 'vitest';
import { buildIntegrityReport, type BlobOnDisk, type FileRecord } from '../../src/modules/analytics/domain/integrity.js';

// Člen VII: sistem, ki se pokvari, mora znati povedati, da je pokvarjen.
//
// Kakovostna vrata (točka 2): primer "neuspel klic, ki se uspešno ponovi" v tej funkcionalnosti
// nima predmeta (odhodnih klicev ni). Nadomeščajo ga LASTNE ODPOVEDI — tu razhajanje med diskom in
// bazo, drugje `statfs`, ki pade, in `E11000` ob hkratnem ogledu.

const NOW = new Date('2026-05-10T12:00:00Z');
const GRACE_HOURS = 24;
const STALLED_MINUTES = 360;

function record(over: Partial<FileRecord> = {}): FileRecord {
  return {
    storageId: 'aa11',
    byteSize: 1000,
    state: 'ready',
    updatedAt: new Date('2026-05-10T11:00:00Z'),
    ...over,
  };
}

function blob(over: Partial<BlobOnDisk> = {}): BlobOnDisk {
  return { storageId: 'aa11', bytes: 1000, modifiedAt: new Date('2026-05-10T11:00:00Z'), ...over };
}

function build(records: FileRecord[], blobs: BlobOnDisk[]) {
  return buildIntegrityReport({
    records,
    blobs,
    now: NOW,
    orphanGraceHours: GRACE_HOURS,
    stalledUploadMinutes: STALLED_MINUTES,
  });
}

describe('buildIntegrityReport', () => {
  it('brez razhajanj je `clean: true` — IZRECNA trditev, ne prazen seznam (FR-019)', () => {
    // Prazen `findings` se ne da ločiti od preverbe, ki ni tekla.
    const report = build([record()], [blob()]);
    expect(report.clean).toBe(true);
    expect(report.findings).toEqual([]);
    expect(report.checkedAt).toEqual(NOW);
  });

  it('zapis brez vsebine na disku je prijavljen s številom IN zabeleženo velikostjo', () => {
    const report = build([record({ byteSize: 4096 })], []);
    expect(report.clean).toBe(false);
    expect(report.findings).toContainEqual({ kind: 'missing-content', recordCount: 1, bytes: 4096 });
  });

  it('zapis v stanju `uploading` NI prijavljen kot manjkajoča vsebina — še je nima', () => {
    const report = build([record({ state: 'uploading', updatedAt: NOW })], []);
    expect(report.findings.some((f) => f.kind === 'missing-content')).toBe(false);
  });

  it('preklican zapis NI prijavljen kot manjkajoča vsebina — bil je namerno pospravljen', () => {
    const report = build([record({ state: 'revoked' })], []);
    expect(report.clean).toBe(true);
  });

  it('sirota na disku je prijavljena s prostorom, ki ga zaseda', () => {
    const report = build([], [blob({ storageId: 'sirota', bytes: 1_048_576, modifiedAt: new Date('2026-05-01T00:00:00Z') })]);
    expect(report.findings).toContainEqual({ kind: 'orphan-blob', recordCount: 1, bytes: 1_048_576 });
  });

  it('sirota, MLAJŠA od obdobja milosti, se ne prijavi — lahko je nalaganje, ki teče', () => {
    // Opozorilo o normalnem delovanju je slabše od nobenega opozorila: naslednjega nihče ne bere.
    const report = build([], [blob({ storageId: 'ravnokar', modifiedAt: new Date('2026-05-10T11:00:00Z') })]);
    expect(report.clean).toBe(true);
  });

  it('okvarjen zapis je preštet — danes ga nihče ne vidi, dokler nekdo ne poskusi prenosa', () => {
    const report = build([record({ state: 'broken', byteSize: 10 })], []);
    const kinds = report.findings.map((f) => f.kind);
    // Okvarjen zapis brez vsebine je OBOJE in se pojavi v obeh ugotovitvah — vsaka odgovarja na
    // svoje vprašanje ("kaj je pokvarjeno" in "kaj bi na disku moralo biti").
    expect(kinds).toContain('broken-record');
    expect(kinds).toContain('missing-content');
  });

  it('obtičalo nalaganje je prijavljeno, sveže pa ne', () => {
    const stalled = record({ storageId: 'staro', state: 'uploading', updatedAt: new Date('2026-05-09T00:00:00Z') });
    const fresh = record({ storageId: 'novo', state: 'uploading', updatedAt: new Date('2026-05-10T11:59:00Z') });
    const report = build([stalled, fresh], []);
    expect(report.findings).toContainEqual({ kind: 'stalled-upload', recordCount: 1, bytes: 1000 });
  });

  it('več zapisov iste vrste se sešteje v ENO ugotovitev, ne v seznam posameznih', () => {
    const report = build([record({ storageId: 'a', byteSize: 1 }), record({ storageId: 'b', byteSize: 2 })], []);
    const missing = report.findings.filter((f) => f.kind === 'missing-content');
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ recordCount: 2, bytes: 3 });
  });

  it('ničesar ne spremeni na vhodnih podatkih (FR-020 — pregled ne ukrepa)', () => {
    const records = [record()];
    const blobs = [blob({ storageId: 'sirota', modifiedAt: new Date('2026-01-01T00:00:00Z') })];
    const snapshotBefore = JSON.stringify({ records, blobs });
    build(records, blobs);
    expect(JSON.stringify({ records, blobs })).toBe(snapshotBefore);
  });
});
