import { describe, expect, it } from 'vitest';
import { rollupStorage, UNKNOWN_OWNER_LABEL } from '../../src/modules/analytics/domain/storage-rollup.js';
import { rollupUsage } from '../../src/modules/analytics/domain/usage-rollup.js';
import type { StorageSourceDef } from '../../src/modules/analytics/domain/storage-sources.js';

// Dve nasprotni napaki, ki ju je pri agregaciji lahko narediti, in ju ta datoteka lovi
// (research.md §9): izpuščene vrstice brez lastnika (vsota se ne izide) in izpuščene prazne
// vrstice (vprašanje "kdo ničesar ne uporablja" ostane brez odgovora).

const SOURCES: Array<StorageSourceDef & { present: boolean }> = [
  { id: 'a', label: 'Vir A', collection: 'as', ownerField: 'userId', sizeExpression: '$byteSize', present: true },
  { id: 'b', label: 'Vir B', collection: 'bs', ownerField: 'ownerId', sizeExpression: '$byteSize', present: true },
  { id: 'c', label: 'Vir C', collection: 'cs', ownerField: 'userId', sizeExpression: null, present: false },
];

const USERS = [
  { id: 'u1', displayName: 'Ana Novak', maskedEmail: 'a…k@agenda.si', lastLoginAt: null },
  { id: 'u2', displayName: 'Bojan Kos', maskedEmail: 'b…s@agenda.si', lastLoginAt: null },
];

describe('rollupStorage', () => {
  it('vsota vrstice po osebi je enaka vsoti njenih postavk', () => {
    const out = rollupStorage({
      sources: SOURCES,
      rows: [
        { sourceId: 'a', ownerId: 'u1', bytes: 100, count: 2 },
        { sourceId: 'b', ownerId: 'u1', bytes: 50, count: 1 },
      ],
      users: USERS,
    });
    const ana = out.byUser.find((u) => u.userId === 'u1')!;
    expect(ana.totalBytes).toBe(150);
    expect((ana.perSource.a ?? 0) + (ana.perSource.b ?? 0)).toBe(ana.totalBytes);
  });

  it('oseba BREZ vsebine je v tabeli z ničlo in ne manjka (FR-008)', () => {
    const out = rollupStorage({
      sources: SOURCES,
      rows: [{ sourceId: 'a', ownerId: 'u1', bytes: 100, count: 1 }],
      users: USERS,
    });
    const bojan = out.byUser.find((u) => u.userId === 'u2');
    expect(bojan).toBeDefined();
    expect(bojan!.totalBytes).toBe(0);
    // Vsi viri so v razbitju, tudi tisti, ki jih ta oseba nima — sicer bi bila tabela nazobčana.
    expect(Object.keys(bojan!.perSource).sort()).toEqual(['a', 'b', 'c']);
  });

  it('zapis brez lastnika pristane v vrstici "neznan lastnik" in OSTANE v skupni vsoti (FR-013)', () => {
    const out = rollupStorage({
      sources: SOURCES,
      rows: [
        { sourceId: 'a', ownerId: 'u1', bytes: 100, count: 1 },
        { sourceId: 'a', ownerId: null, bytes: 7, count: 1 },
        { sourceId: 'b', ownerId: 'nekdo-ki-ga-ni', bytes: 3, count: 1 },
      ],
      users: USERS,
    });

    expect(out.totalBytes).toBe(110);
    const unknown = out.byUser.find((u) => u.userId === null)!;
    expect(unknown.displayName).toBe(UNKNOWN_OWNER_LABEL);
    expect(unknown.totalBytes).toBe(10);
    // Vsota vseh vrstic mora biti enaka skupni — to je preverba, zaradi katere ta vrstica obstaja.
    expect(out.byUser.reduce((s, u) => s + u.totalBytes, 0)).toBe(out.totalBytes);
  });

  it('vrstice "neznan lastnik" NI, kadar vsi zapisi imajo lastnika', () => {
    const out = rollupStorage({
      sources: SOURCES,
      rows: [{ sourceId: 'a', ownerId: 'u1', bytes: 100, count: 1 }],
      users: USERS,
    });
    expect(out.byUser.some((u) => u.userId === null)).toBe(false);
  });

  it('odsoten vir ostane v seznamu s `present: false` in ničlami (FR-012)', () => {
    const out = rollupStorage({ sources: SOURCES, rows: [], users: USERS });
    const c = out.sources.find((s) => s.id === 'c')!;
    expect(c).toMatchObject({ present: false, totalBytes: 0, recordCount: 0 });
  });

  it('vrstica vira, ki ga tabela ne pozna, se ne zlije tiho v skupno vsoto', () => {
    const out = rollupStorage({
      sources: SOURCES,
      rows: [{ sourceId: 'neznan-vir', ownerId: 'u1', bytes: 999, count: 1 }],
      users: USERS,
    });
    expect(out.totalBytes).toBe(0);
  });

  it('osebe so urejene po porabi navzdol, neznan lastnik pa je zadnji', () => {
    const out = rollupStorage({
      sources: SOURCES,
      rows: [
        { sourceId: 'a', ownerId: 'u2', bytes: 500, count: 1 },
        { sourceId: 'a', ownerId: 'u1', bytes: 100, count: 1 },
        { sourceId: 'a', ownerId: null, bytes: 900, count: 1 },
      ],
      users: USERS,
    });
    expect(out.byUser.map((u) => u.userId)).toEqual(['u2', 'u1', null]);
  });
});

describe('rollupUsage', () => {
  const TABS = [
    { id: 'dashboard', title: 'Nadzorna plošča' },
    { id: 'notes', title: 'Beležke' },
    { id: 'cameras', title: 'Kamere' },
  ];

  it('prešteje prijave in oglede po osebi', () => {
    const out = rollupUsage({
      rows: [
        { userId: 'u1', kind: 'login', key: '-', count: 3, lastAt: new Date('2026-05-10T08:00:00Z') },
        { userId: 'u1', kind: 'tab-view', key: 'notes', count: 5, lastAt: new Date('2026-05-10T09:00:00Z') },
      ],
      users: USERS,
      tabs: TABS,
    });
    const ana = out.byUser.find((u) => u.userId === 'u1')!;
    expect(ana.logins).toBe(3);
    expect(ana.tabs.notes).toBe(5);
    expect(out.logins.total).toBe(3);
  });

  it('zavihek, ki ga nihče ni odprl, je na lestvici z ničlo (FR-039)', () => {
    // Neuporabljen zavihek je ravno tisti podatek, zaradi katerega lestvica obstaja.
    const out = rollupUsage({
      rows: [{ userId: 'u1', kind: 'tab-view', key: 'notes', count: 2, lastAt: new Date() }],
      users: USERS,
      tabs: TABS,
    });
    expect(out.tabs.map((t) => t.tabId).sort()).toEqual(['cameras', 'dashboard', 'notes']);
    expect(out.tabs.find((t) => t.tabId === 'cameras')!.views).toBe(0);
  });

  it('oseba brez prijav je v seznamu z ničlo in šteje med neaktivne', () => {
    const out = rollupUsage({
      rows: [{ userId: 'u1', kind: 'login', key: '-', count: 1, lastAt: new Date() }],
      users: USERS,
      tabs: TABS,
    });
    expect(out.logins.activeUsers).toBe(1);
    expect(out.logins.inactiveUsers).toBe(1);
    expect(out.byUser.find((u) => u.userId === 'u2')!.logins).toBe(0);
  });

  it('`users` na lestvici šteje RAZLIČNE osebe, ne ogledov', () => {
    const out = rollupUsage({
      rows: [
        { userId: 'u1', kind: 'tab-view', key: 'notes', count: 10, lastAt: new Date() },
        { userId: 'u2', kind: 'tab-view', key: 'notes', count: 1, lastAt: new Date() },
      ],
      users: USERS,
      tabs: TABS,
    });
    const notes = out.tabs.find((t) => t.tabId === 'notes')!;
    expect(notes.views).toBe(11);
    expect(notes.users).toBe(2);
  });

  it('lastActiveAt je NAJPOZNEJŠI dogodek, ne zadnji obdelani', () => {
    const out = rollupUsage({
      rows: [
        { userId: 'u1', kind: 'tab-view', key: 'notes', count: 1, lastAt: new Date('2026-05-10T12:00:00Z') },
        { userId: 'u1', kind: 'login', key: '-', count: 1, lastAt: new Date('2026-05-09T12:00:00Z') },
      ],
      users: USERS,
      tabs: TABS,
    });
    expect(out.byUser.find((u) => u.userId === 'u1')!.lastActiveAt?.toISOString()).toBe('2026-05-10T12:00:00.000Z');
  });

  it('lastLoginAt pride iz zapisa o uporabniku in preživi obdobje brez prijav', () => {
    // Pokriva čas PRED uvedbo te funkcionalnosti — takrat števcev ni, `lastLoginAt` pa je.
    const out = rollupUsage({
      rows: [],
      users: [{ ...USERS[0]!, lastLoginAt: new Date('2025-01-01T10:00:00Z') }],
      tabs: TABS,
    });
    expect(out.byUser[0]!.logins).toBe(0);
    expect(out.byUser[0]!.lastLoginAt?.toISOString()).toBe('2025-01-01T10:00:00.000Z');
  });

  it('števec zavihka, ki ga register ne pozna več, ne izmisli vrstice', () => {
    const out = rollupUsage({
      rows: [{ userId: 'u1', kind: 'tab-view', key: 'odstranjen-modul', count: 9, lastAt: new Date() }],
      users: USERS,
      tabs: TABS,
    });
    expect(out.tabs.some((t) => t.tabId === 'odstranjen-modul')).toBe(false);
    expect(out.tabs.reduce((s, t) => s + t.views, 0)).toBe(0);
  });
});
