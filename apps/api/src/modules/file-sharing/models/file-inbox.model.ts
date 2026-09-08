import { Schema, model, type InferSchemaType } from 'mongoose';
import { INBOX_STATES } from '../domain/inbox-lifecycle.js';

// SPREJEMNI PREDAL (009b) — obrnjena povezava: naslov in koda, ki ju lastnik pošlje NEKOMU
// DRUGEMU, da mu ta odda datoteko.
//
// Predal je zapis brez vsebine. Kar prispe po njem, je zapis v `sharedFiles` z `inboxId` —
// nikoli poddokument tukaj (FR-092): prejeta datoteka je od trenutka prejema lastnikova, šteje
// v njegovo kvoto in mora živeti naprej, tudi ko predala ni več (FR-094). Poddokument bi ob
// izbrisu predala odnesel datoteke s sabo.
//
// Česa v zapisu NI in nikoli ne bo: čistopisa kode, dovolilnice za oddajo, naslova IP
// pošiljatelja. Zgrešeni poskusi kode so števec (`failedAttempts`), ne seznam poskusov —
// lastnik mora videti, DA kdo ugiba, ne pa zbirke tujih naslovov.

const fileInboxSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** Za koga je predal — vidno šele PO vpisu kode (FR-084). Oznaka pogosto pove vsebino
     * ("Skenirane pogodbe"), enako kot ime datoteke pri deljenju. */
    label: { type: String, required: true, maxlength: 80 },
    /** Navodilo pošiljatelju ("pošlji obe strani"). Prav tako šele po kodi. */
    note: { type: String, default: '', maxlength: 500 },
    /** Del javnega naslova. `null` ne nastopi nikoli — predal brez naslova ne bi imel namena —
     * polje pa je vseeno lahko `null`, ker delni indeks spodaj zahteva razločevanje. */
    token: { type: String, default: null },
    /** `scrypt$N$r$p$sol$povzetek` (domain/share-password.ts, ista koda kot geslo za prevzem).
     * Iz njega kode ni mogoče izračunati — sistem jo zna samo preveriti (FR-082). */
    codeHash: { type: String, required: true },
    state: { type: String, enum: INBOX_STATES, required: true, default: 'open' },
    /** `null` pomeni BREZ ROKA, ne "poteklo" (domain/inbox-lifecycle.ts). */
    expiresAt: { type: Date, default: null },
    /** Meji, ki jih je izbral LASTNIK ob nastanku (FR-087). Shranjeni sta na predalu in ne
     * prebrani iz okolja ob vsaki oddaji: sprememba nastavitve namestitve ne sme za nazaj
     * razširiti predala, ki ga je lastnik namenoma naredil majhnega. */
    maxFiles: { type: Number, required: true },
    maxTotalBytes: { type: Number, required: true },
    /** Zgrešeni poskusi kode od zadnje uspešne odklenitve — lastnik MORA videti, da nekdo
     * ugiba (FR-090), in to v odgovoru API-ja, ne le v dnevniku, ki ga nihče ne bere. */
    failedAttempts: { type: Number, required: true, default: 0 },
    lockedUntil: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

fileInboxSchema.index({ userId: 1, createdAt: -1 });
// DELNI indeks in ne `sparse` — iz istega razloga kot pri `sharedFiles.token`: `sparse` izpusti
// samo dokumente, kjer polja SPLOH NI, ne tistih z vrednostjo `null`.
fileInboxSchema.index({ token: 1 }, { unique: true, partialFilterExpression: { token: { $type: 'string' } } });
// NI TTL indeks: potekel predal se ne pobriše sam, ampak ga pobere pometač modula — skupaj z
// dovolilnicami in šele po roku hrambe (services/cleanup.service.ts). TTL bi zapis odnesel in
// pustil dovolilnice za predal, ki ga ni.
fileInboxSchema.index({ expiresAt: 1 });

export type FileInboxDoc = InferSchemaType<typeof fileInboxSchema>;
export const FileInboxModel = model('FileInbox', fileInboxSchema);
