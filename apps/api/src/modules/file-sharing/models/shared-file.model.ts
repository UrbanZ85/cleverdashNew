import { Schema, model, type InferSchemaType } from 'mongoose';
import { SHARE_STATES } from '../domain/share-lifecycle.js';

// data-model.md (009). Prva funkcionalnost, pri kateri baza NI edino mesto stanja: zapis je
// tu, vsebina pa na disku (`services/blob-storage.service.ts`). Razhajanje med njima je zato
// obravnavano kot stanje, ki ga sistem zna zaznati in prijaviti — `state: 'broken'`, člen VII.
//
// Česa v zapisu NI in nikoli ne bo: čistopisa gesla, dovolilnice, vsebine datoteke in poti do
// nje (pot se izpelje iz `storageId` in `FILE_SHARE_DIR`, da preselitev nosilca ne zahteva
// migracije).

const sharedFileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** Očiščeno ime za PRIKAZ (domain/file-name.ts) — nikoli pot. */
    displayName: { type: String, required: true, maxlength: 200 },
    mimeType: { type: String, required: true, default: 'application/octet-stream' },
    /** Med nalaganjem napovedana velikost, po njem dejanska velikost na disku. */
    byteSize: { type: Number, required: true },
    /** Ime datoteke na disku: 32 šestnajstiških znakov, naključno. NE pove ničesar o vsebini. */
    storageId: { type: String, required: true },
    state: { type: String, enum: SHARE_STATES, required: true, default: 'uploading' },
    /** Del javne povezave. `null`, dokler nalaganje ne uspe — povezava do nepopolne datoteke
     * ne sme obstajati niti za trenutek. */
    token: { type: String, default: null },
    /** `scrypt$N$r$p$sol$povzetek` (domain/share-password.ts). Iz njega gesla ni mogoče
     * izračunati — sistem ga zna samo preveriti (FR-012). */
    passwordHash: { type: String, default: null },
    /** `null` pomeni BREZ ROKA, ne "poteklo" (domain/share-lifecycle.ts). */
    expiresAt: { type: Date, default: null },
    downloadCount: { type: Number, required: true, default: 0 },
    lastDownloadedAt: { type: Date, default: null },
    /** Zgrešeni poskusi gesla od zadnje uspešne odklenitve — lastnik MORA videti, da nekdo
     * ugiba (FR-033), in to v odgovoru API-ja, ne le v dnevniku, ki ga nihče ne bere. */
    failedAttempts: { type: Number, required: true, default: 0 },
    lockedUntil: { type: Date, default: null },
    // ── 009b: od kod je zapis ───────────────────────────────────────────────────────────
    //
    // `null` pomeni, da je datoteko naložil LASTNIK sam. Neprazen `inboxId` pomeni, da jo je
    // prek sprejemnega predala oddal nekdo brez računa (FR-092).
    //
    // Zapis je od tega trenutka lastnikov in ni z ničemer drugačen: šteje v njegovo kvoto, na
    // njegovem seznamu je in nima ne žetona ne gesla, dokler mu ju izrecno ne izda (FR-093).
    // Referenca se NAMENOMA ne počisti, ko predal izgine — pove, kako je datoteka prišla, in ta
    // dejstvo se z izbrisom predala ne spremeni (FR-094).
    inboxId: { type: Schema.Types.ObjectId, ref: 'FileInbox', default: null },
    /** Kar je o sebi napisal pošiljatelj. NAVEDBA, ne ugotovljena istovetnost — očiščena v
     * domain/sender-name.ts, ker je to edini prosti vnos od nekoga brez računa. */
    senderName: { type: String, default: null, maxlength: 80 },
    /**
     * Kdaj je vsebina za to napoved ZAČELA prihajati; `null`, dokler ni začela.
     *
     * Obstaja zaradi ene same nevarnosti: dve HKRATNI zahtevi za vsebino ISTE napovedi. Stanje
     * `uploading` se prevesi šele na koncu, zato bi obe prestali preverjanje stanja, obe pisali
     * v isto začasno datoteko in obe videli pričakovano število bajtov — na disku bi ostala
     * prepletena vsebina, zapis pa bi bil videti uspešen. Natanko tiha napaka, ki jo prepoveduje
     * člen VII.
     *
     * Polje je zato ZAPORA, ne podatek: prevzame ga `findOneAndUpdate` s pogojem `null`, in
     * druga zahteva ne najde ničesar. Ena napoved, en poskus; ponoven poskus je nova napoved.
     */
    uploadClaimedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

sharedFileSchema.index({ userId: 1, createdAt: -1 });
// DELNI indeks, ne `sparse`. Zapisi v stanju `uploading` še nimajo žetona in imajo `token: null`
// — `sparse` izpusti samo dokumente, kjer polja SPLOH NI, ne tistih z vrednostjo `null`. Z
// `sparse` je zato drugo hkratno nalaganje padlo z "E11000 dup key: { token: null }". Delni
// indeks unikatnost uveljavi izključno nad dejanskimi žetoni.
sharedFileSchema.index({ token: 1 }, { unique: true, partialFilterExpression: { token: { $type: 'string' } } });
sharedFileSchema.index({ storageId: 1 }, { unique: true });
// NI TTL indeks: TTL bi zbrisal zapis in pustil vsebino na disku kot siroto. Brisati je treba
// oboje in v pravem vrstnem redu (services/cleanup.service.ts, research.md §15).
sharedFileSchema.index({ expiresAt: 1 });
sharedFileSchema.index({ state: 1, updatedAt: 1 });
// 009b: zasedenost predala se sešteje z agregacijo po `inboxId` (domain/inbox-capacity.ts) —
// enako kot kvota po `userId` in iz istega razloga. Brez indeksa bi bilo to pregledovanje vseh
// datotek namestitve ob VSAKI oddaji, torej na javni poti.
sharedFileSchema.index({ inboxId: 1, createdAt: -1 });

export type SharedFileDoc = InferSchemaType<typeof sharedFileSchema>;
export const SharedFileModel = model('SharedFile', sharedFileSchema);
