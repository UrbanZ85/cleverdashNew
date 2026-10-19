import mongoose from 'mongoose';
import type { Logger } from '../../logging/logger.js';
import { auditLegacyDropped } from '../scanner.audit.js';

// Enkratno čiščenje ob zagonu (016, research.md §9, FR-036). Modul Leti (015) je imel svoj
// model zagona, svoje nastavitve urnika in svoj outbox dopisov; vse troje je nasledilo jedro
// (`scannerruns`, `scannertypesettings`, `scannernotifications`). Podatki v starih zbirkah so bili
// testni — lastnik namestitve je 19. 10. 2026 odločil, da se NE selijo, ampak izbrišejo.
//
// To je edino mesto v jedru, ki pozna imena zbirk modula 015, in edina destruktivna operacija v
// njem. Idempotentno: zbirke, ki je ni, se ne dotakne; vsak drop je v dnevniku s številom
// dokumentov (člen VII). Iskanja, ponudbe, ujemanja, zgodovina cen in stanje virov letov
// OSTANEJO — do njih se ta datoteka ne dotakne.

export const LEGACY_FLIGHT_COLLECTIONS = ['flightsearchruns', 'flightschedulersettings', 'flightnotifications'] as const;

export async function dropLegacyFlightSchedulerCollections(logger: Logger | undefined): Promise<Array<{ collection: string; documents: number }>> {
  const db = mongoose.connection.db;
  if (!db) return [];
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const dropped: Array<{ collection: string; documents: number }> = [];
  for (const name of LEGACY_FLIGHT_COLLECTIONS) {
    if (!existing.has(name)) continue;
    const documents = await db.collection(name).countDocuments();
    await db.collection(name).drop();
    dropped.push({ collection: name, documents });
    auditLegacyDropped(logger, { collection: name, documents });
  }
  return dropped;
}
