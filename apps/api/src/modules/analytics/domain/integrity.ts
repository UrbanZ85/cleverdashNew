// Razhajanja med bazo in nosilcem (člen VII: sistem, ki se pokvari, mora znati povedati, da je
// pokvarjen).
//
// Čista razsodba nad dvema množicama identifikatorjev in stanji zapisov — brez diska, brez baze.
// Kdo množici sestavi, je stvar `services/disk-scan.service.ts`.
//
// TA KODA NIČESAR NE POPRAVI (FR-020). Pregled pove, da sirota obstaja; njenega brisanja ne
// ponudi. Pometanje je delo modula 009 in tam že je — dve kodi, ki brišeta iste datoteke, sta
// dvakrat več priložnosti, da se pobriše napačna.

export type FindingKind = 'missing-content' | 'orphan-blob' | 'broken-record' | 'stalled-upload';

export interface IntegrityFinding {
  kind: FindingKind;
  recordCount: number;
  /** Zabeležena velikost prizadetih zapisov oz. prostor, ki ga zasedajo sirote. */
  bytes: number;
}

export interface IntegrityReport {
  checkedAt: Date;
  /** IZRECNA trditev "razhajanj ni". Prazen `findings` sam po sebi tega ne pove — ne da se ga
   * ločiti od preverbe, ki ni tekla. */
  clean: boolean;
  findings: IntegrityFinding[];
}

/** Zapis o datoteki, kakor ga za to razsodbo potrebujemo. */
export interface FileRecord {
  storageId: string;
  byteSize: number;
  state: string;
  /** Kdaj se je zapis nazadnje premaknil — za ugotavljanje obtičalega nalaganja. */
  updatedAt: Date;
}

/** Datoteka, najdena na nosilcu. */
export interface BlobOnDisk {
  storageId: string;
  bytes: number;
  modifiedAt: Date;
}

export function buildIntegrityReport(params: {
  records: readonly FileRecord[];
  blobs: readonly BlobOnDisk[];
  now: Date;
  orphanGraceHours: number;
  stalledUploadMinutes: number;
}): IntegrityReport {
  const { records, blobs, now, orphanGraceHours, stalledUploadMinutes } = params;

  const onDisk = new Set(blobs.map((b) => b.storageId));
  const known = new Set(records.map((r) => r.storageId));

  const findings: IntegrityFinding[] = [];

  // 1. Zapis brez vsebine. Samo za zapise, ki bi vsebino MORALI imeti: `uploading` je še nima po
  //    definiciji, `revoked` pa je bil namerno pospravljen.
  const missing = records.filter(
    (r) => (r.state === 'ready' || r.state === 'broken') && !onDisk.has(r.storageId),
  );
  if (missing.length > 0) {
    findings.push({
      kind: 'missing-content',
      recordCount: missing.length,
      bytes: missing.reduce((sum, r) => sum + r.byteSize, 0),
    });
  }

  // 2. Vsebina brez zapisa. Mlajša od obdobja milosti se NE prijavi — lahko je nalaganje, ki ravno
  //    teče, in opozorilo o njem bi bilo opozorilo o normalnem delovanju. Isto okno in isti razlog
  //    kot `ORPHAN_GRACE_MS` v pometaču modula 009.
  const graceCutoff = new Date(now.getTime() - orphanGraceHours * 60 * 60 * 1000);
  const orphans = blobs.filter((b) => !known.has(b.storageId) && b.modifiedAt < graceCutoff);
  if (orphans.length > 0) {
    findings.push({
      kind: 'orphan-blob',
      recordCount: orphans.length,
      bytes: orphans.reduce((sum, b) => sum + b.bytes, 0),
    });
  }

  // 3. Zapis, ki se je sam označil za okvarjenega. Modul 009 to stanje pozna in zapiše, a ga danes
  //    nihče ne vidi, dokler nekdo ne poskusi datoteke prenesti — kar je natanko tiha napaka.
  const broken = records.filter((r) => r.state === 'broken');
  if (broken.length > 0) {
    findings.push({
      kind: 'broken-record',
      recordCount: broken.length,
      bytes: broken.reduce((sum, r) => sum + r.byteSize, 0),
    });
  }

  // 4. Nalaganje, ki se že dolgo ni premaknilo. Prekinjena povezava pusti zapis v `uploading` in
  //    delno datoteko v `tmp/`; pometač ju pospravi, a dokler tega ne stori, zasedata prostor.
  const stalledCutoff = new Date(now.getTime() - stalledUploadMinutes * 60 * 1000);
  const stalled = records.filter((r) => r.state === 'uploading' && r.updatedAt < stalledCutoff);
  if (stalled.length > 0) {
    findings.push({
      kind: 'stalled-upload',
      recordCount: stalled.length,
      bytes: stalled.reduce((sum, r) => sum + r.byteSize, 0),
    });
  }

  return { checkedAt: now, clean: findings.length === 0, findings };
}
