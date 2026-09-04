/**
 * Enkratna, ROČNO ZAGNANA migracija iz starega sistema (`d:\programiranje\privat\belezenje_casa`)
 * v novo shemo 002 — Beleženje časa. Glej preslikavo v
 * `specs/002-time-tracking/data-model.md` ("Preslikava iz starega modela") in kontekst v
 * `docs/legacy-engine.md`.
 *
 * NAMENOMA SE NE ZAGANJA SAMODEJNO:
 *  - ni registrirana v `main.ts`, `scheduler.ts` ali katerikoli npm `pre*`/`post*` kljuki,
 *  - privzeto teče v načinu DRY-RUN (samo izpiše, kaj bi naredila, brez pisanja),
 *  - dejansko pisanje zahteva EKSPLICITNO zastavico `--execute` na ukazni vrstici,
 *  - po quickstart.md §6 se izvede šele, ko nov sistem v `DRY_RUN=true` vsaj en teden
 *    pravilno napoveduje iste akcije kot star sistem.
 *
 * Zagon (dry-run, varno):
 *   LEGACY_MONGO_URI=mongodb://localhost:27017/belezenje_casa \
 *   MONGO_URI=mongodb://localhost:27017/cleverdash \
 *   npx tsx scripts/migrate-legacy-time-tracking.ts
 *
 * Dejanski zapis (šele po ročni potrditvi izpisa dry-run):
 *   ... npx tsx scripts/migrate-legacy-time-tracking.ts --execute
 *
 * Idempotentnost: vsak vstavljen dokument dobi `migratedFrom: { collection, legacyId }`;
 * ponoven zagon z `--execute` PRESKOČI dokumente, ki že imajo ujemajoč `migratedFrom`
 * (ni podvajanja, varno za ponovni zagon po delnem neuspehu).
 */
import { MongoClient, type Db, ObjectId } from 'mongodb';

interface LegacySiteProperties {
  url?: string;
  coordinates?: { latitude?: string; longitude?: string };
  cookie?: { name?: string; value?: string; domain?: string };
}

// Oblika kolekcije `schedulers` v starem sistemu — glej docs/legacy-engine.md.
// Polja so neobvezna, ker stara shema ni bila strogo validirana (Mongoose brez `strict`).
interface LegacyScheduler {
  _id: ObjectId;
  name?: string;
  daysToStart?: number[]; // 0 = nedelja (Date.getDay()) — NE ISO!
  isWorkingFromHome?: boolean;
  workdaystart?: string; // "HH:mm" domnevno
  workdayEnd?: string;
  pauseUntil?: string | Date | null;
  siteProperties?: LegacySiteProperties;
}

interface LegacySchedulerTimesHistory {
  _id: ObjectId;
  schedulerId?: ObjectId;
  actionName?: string;
  scheduledDate?: string | Date;
  executed?: boolean; // dvojiška zastavica — NI ločila "kliknjeno" od "preverjeno uspešno"
}

const DAY_OF_WEEK_LEGACY_TO_ISO: Record<number, number> = {
  0: 7, // nedelja
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
};

function parseArgs(argv: string[]): { execute: boolean } {
  return { execute: argv.includes('--execute') };
}

async function migrateLocationsAndSessions(
  legacyDb: Db,
  newDb: Db,
  execute: boolean,
): Promise<Map<string, ObjectId>> {
  // schedulers.siteProperties.{url,coordinates} → trackingLocations
  // schedulers.siteProperties.cookie → remoteSessions (VREDNOST SE NE PRENESE — potekla
  // 24. 1. 2025, glej data-model.md; novo sejo je treba nastaviti ročno prek
  // `app-time-tracking-settings` ali PUT /time-tracking/sessions/{id}).
  const schedulers = await legacyDb.collection<LegacyScheduler>('schedulers').find().toArray();
  const locationIdByLegacySchedulerId = new Map<string, ObjectId>();

  for (const s of schedulers) {
    const legacyId = String(s._id);
    const siteProps = s.siteProperties ?? {};
    const sessionDoc = {
      name: `${s.name ?? 'migrirana seja'} (migrirano)`,
      cookieName: siteProps.cookie?.name ?? 'NEZNANO — nastavi ročno',
      // Namerno NE `siteProps.cookie?.value` — potekla, nikoli je ne prenašamo naprej.
      cookieValue: 'MIGRACIJA-PLACEHOLDER-NASTAVI-ROCNO',
      cookieDomain: siteProps.cookie?.domain ?? 'e-racuni.com',
      status: 'expired' as const,
      migratedFrom: { collection: 'schedulers', legacyId, field: 'siteProperties.cookie' },
    };

    // FR-094: star zapis brez koordinat NE dobi izmišljenih (`0.0_0` je veljavna točka sredi
    // Atlantika, ne "ne vem") — dobi izklopljeno pošiljanje lokacije. Če jih je imel, se
    // prenesejo in pošiljanje ostane vklopljeno, kot je delovalo doslej.
    const legacyCoordinates =
      siteProps.coordinates?.latitude && siteProps.coordinates.longitude
        ? { latitude: siteProps.coordinates.latitude, longitude: siteProps.coordinates.longitude }
        : undefined;

    const locationDoc = {
      name: s.name ?? `Migrirana lokacija ${legacyId}`,
      url: siteProps.url ?? '',
      ...(legacyCoordinates ? { coordinateTemplate: legacyCoordinates } : {}),
      sendGeolocation: legacyCoordinates !== undefined,
      // FR-090: gumb za začetek dela je lastnost lokacije. Star `schedulers.isWorkingFromHome`
      // je bil zastavica na URNIKU — tu se preslika v lastnost KRAJA, kamor sodi.
      startAction: s.isWorkingFromHome ? 'Delo od doma' : 'Prijava na delo',
      jitterMeters: 10,
      active: false, // ročna potrditev pred aktivacijo — glej opombo v spec.md Out of Scope
      migratedFrom: { collection: 'schedulers', legacyId, field: 'siteProperties' },
    };

    console.log(`[dry-run] RemoteSession za "${s.name}" (${legacyId}):`, sessionDoc);
    console.log(`[dry-run] TrackingLocation za "${s.name}" (${legacyId}):`, locationDoc);

    if (!execute) continue;

    const existingLocation = await newDb
      .collection('trackinglocations')
      .findOne({ 'migratedFrom.legacyId': legacyId });
    if (existingLocation) {
      locationIdByLegacySchedulerId.set(legacyId, existingLocation._id as ObjectId);
      console.log(`  → že migrirano, preskočeno (${legacyId})`);
      continue;
    }

    const sessionResult = await newDb.collection('remotesessions').insertOne({
      ...sessionDoc,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const locationResult = await newDb.collection('trackinglocations').insertOne({
      ...locationDoc,
      sessionId: sessionResult.insertedId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    locationIdByLegacySchedulerId.set(legacyId, locationResult.insertedId);
  }

  return locationIdByLegacySchedulerId;
}

async function migrateProfiles(
  legacyDb: Db,
  newDb: Db,
  execute: boolean,
  locationIdByLegacySchedulerId: Map<string, ObjectId>,
): Promise<void> {
  const schedulers = await legacyDb.collection<LegacyScheduler>('schedulers').find().toArray();

  for (const s of schedulers) {
    const legacyId = String(s._id);
    const legacyDays = s.daysToStart ?? [];
    // KRITIČNO: staro 0 = nedelja (Date.getDay()), novo 1 = ponedeljek (ISO). Napačna
    // pretvorba pomeni zamik za en dan — glej data-model.md opozorilo.
    const daysOfWeek = legacyDays
      .map((d) => DAY_OF_WEEK_LEGACY_TO_ISO[d])
      .filter((d): d is number => d !== undefined)
      .sort((a, b) => a - b);

    const actions: Array<{ actionName: string; localTime: string; jitterSeconds: number; order: number }> = [];
    if (s.workdaystart) {
      actions.push({
        // Ime je nominalno: ob sestavljanju načrta ga prevzame `startAction` lokacije zgoraj
        // (FR-090, domain/clock-state.ts). V profilu stoji privzeta različica.
        actionName: 'Prijava na delo',
        localTime: normalizeLegacyTime(s.workdaystart),
        jitterSeconds: 300,
        order: 1,
      });
    }
    if (s.workdayEnd) {
      actions.push({
        actionName: 'Konec dela',
        localTime: normalizeLegacyTime(s.workdayEnd),
        jitterSeconds: 300,
        order: 2,
      });
    }

    const profileDoc = {
      name: s.name ?? `Migriran profil ${legacyId}`,
      daysOfWeek,
      mode: 'REMIND_ONLY' as const, // varno privzeto po migraciji — NE AUTO (glej FR-007 Assumptions)
      actions,
      active: false, // ročna potrditev pred aktivacijo
      migratedFrom: { collection: 'schedulers', legacyId },
    };

    console.log(`[dry-run] TrackingProfile za "${s.name}" (${legacyId}):`, profileDoc);

    if (s.pauseUntil) {
      console.log(
        `[dry-run] AbsencePeriod (vrsta "other") za "${s.name}" (${legacyId}) do ${String(s.pauseUntil)}`,
      );
    }

    if (!execute) continue;

    const locationId = locationIdByLegacySchedulerId.get(legacyId);
    if (!locationId) {
      console.warn(`  → PRESKOČENO: ni pripadajoče TrackingLocation za ${legacyId}`);
      continue;
    }

    const existing = await newDb.collection('trackingprofiles').findOne({ 'migratedFrom.legacyId': legacyId });
    if (existing) {
      console.log(`  → že migrirano, preskočeno (${legacyId})`);
      continue;
    }

    await newDb.collection('trackingprofiles').insertOne({
      ...profileDoc,
      locationId,
      graceMinutes: 10,
      maxDelayMinutes: 90,
      maxAttempts: 3,
      retryBackoffSeconds: [30, 120, 300],
      maxReminders: 3,
      reminderIntervalMinutes: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

/** Stara oblika časa ni bila strogo preverjena — poskusi razumno normalizirati na HH:mm:ss. */
function normalizeLegacyTime(raw: string): string {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw.trim());
  if (!match) return '08:00:00';
  const [, h, m, sec] = match;
  return `${h!.padStart(2, '0')}:${m}:${sec ?? '00'}`;
}

async function migrateHistory(legacyDb: Db, newDb: Db, execute: boolean): Promise<void> {
  // schedulerTimes (samo bodoč/tekoč načrt) se ZAVRŽE — nov sistem si načrt sestavi sam
  // (schedule-builder.service.ts, idempotentno). Prenese se samo schedulerTimesHistory,
  // kot zgodovinska evidenca z `source: 'legacy'`.
  const history = await legacyDb.collection<LegacySchedulerTimesHistory>('schedulerTimesHistory').find().toArray();
  console.log(`[dry-run] schedulerTimesHistory: ${history.length} zapisov za prenos v actionRecords`);

  for (const h of history) {
    const legacyId = String(h._id);
    const record = {
      // `executed: boolean` v starem sistemu ni ločil "kliknjeno" od "preverjeno uspešno"
      // (docs/legacy-engine.md §4.5) — konzervativno preslikamo v "succeeded" samo, če je
      // `executed === true`, sicer "missed". To NI popolna slika, ampak najboljša poštena
      // preslikava dvojiške zastavice brez izmišljanja podatkov, ki jih stari sistem ni imel.
      localDate: h.scheduledDate ? String(h.scheduledDate).slice(0, 10) : '1970-01-01',
      profileId: null,
      profileName: 'migrirano iz starega sistema',
      locationName: 'neznano (migracija)',
      actionName: h.actionName ?? 'neznano',
      scheduledAt: h.scheduledDate ? new Date(h.scheduledDate) : new Date(0),
      finalOutcome: h.executed ? 'succeeded' : 'missed',
      source: 'legacy' as const,
      note: 'Migrirano iz schedulerTimesHistory — "executed" ni ločil kliknjeno/preverjeno.',
      migratedFrom: { collection: 'schedulerTimesHistory', legacyId },
    };

    if (!execute) continue;

    const existing = await newDb.collection('actionrecords').findOne({ 'migratedFrom.legacyId': legacyId });
    if (existing) continue;

    await newDb.collection('actionrecords').insertOne({
      ...record,
      completedAt: null,
      stateBefore: null,
      stateAfter: null,
      attemptSummary: { count: 0, firstAt: null, lastAt: null },
      failureReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

async function main(): Promise<void> {
  const { execute } = parseArgs(process.argv.slice(2));
  const legacyUri = process.env.LEGACY_MONGO_URI;
  const newUri = process.env.MONGO_URI;

  if (!legacyUri || !newUri) {
    console.error('Nastavi LEGACY_MONGO_URI in MONGO_URI pred zagonom. Glej komentar na vrhu datoteke.');
    process.exit(1);
  }

  console.log(`Način: ${execute ? 'IZVEDBA (pisanje v novo bazo!)' : 'DRY-RUN (samo izpis, brez pisanja)'}`);
  if (!execute) {
    console.log('Za dejanski zapis poženi z zastavico --execute po ročnem pregledu tega izpisa.\n');
  }

  const legacyClient = new MongoClient(legacyUri);
  const newClient = new MongoClient(newUri);
  try {
    await legacyClient.connect();
    await newClient.connect();
    const legacyDb = legacyClient.db();
    const newDb = newClient.db();

    const locationIdByLegacySchedulerId = await migrateLocationsAndSessions(legacyDb, newDb, execute);
    await migrateProfiles(legacyDb, newDb, execute, locationIdByLegacySchedulerId);
    await migrateHistory(legacyDb, newDb, execute);

    console.log('\nKončano.');
    if (execute) {
      console.log(
        'POMEMBNO: vsi migrirani profili in lokacije so `active: false` in mode `REMIND_ONLY`.\n' +
          'Pred aktivacijo ročno nastavi pravo vrednost piškotka seje (PUT /time-tracking/sessions/{id})\n' +
          'in preveri koordinate/urnik, nato šele preklopi profil v želen `mode` in `active: true`.',
      );
    }
  } finally {
    await legacyClient.close();
    await newClient.close();
  }
}

void main();
