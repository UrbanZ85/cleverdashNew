import { Schema, model, type InferSchemaType } from 'mongoose';

// Dovolilnica za ODDAJO: dokazilo, da je bila za TA predal vpisana pravilna koda (009b, FR-091).
//
// Dvojnik `fileShareGrant`, a z eno bistveno razliko — NE POTUJE V PIŠKOTKU.
//
// Piškotek je ambientna poverilnica: brskalnik ga pripne sam, tudi zahtevi, ki jo je sprožila
// tuja stran. Pri prevzemu je to nujno zlo, ker mora prenos 500 MB sprožiti navigacija brskalnika
// (research.md §8). Pri oddaji ni: nalaganje je XHR z naše lastne strani, zato dovolilnica potuje
// v glavi `X-Drop-Ticket`, ki jo mora odjemalec pripeti IZRECNO. Tuja stran je ne more — brez
// CORS-a (člen II) ji preverjanje pred zahtevo (preflight) ne uspe. S tem je celotna vrsta napada
// CSRF na javno pot, ki PIŠE na disk, odpravljena in ne le omilšena s `SameSite`.
//
// Zakaj ZAPIS in ne podpisan žeton: preklic (zaprtje predala, nova koda) mora razveljaviti tudi
// ŽE IZDANE dovolilnice — podpisanega žetona ni mogoče preklicati brez seznama preklicanih, kar
// je isti zapis, le z več koraki.

const fileInboxTicketSchema = new Schema(
  {
    inboxId: { type: Schema.Types.ObjectId, ref: 'FileInbox', required: true },
    /** 32 naključnih bajtov v base64url. */
    ticket: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

fileInboxTicketSchema.index({ ticket: 1 }, { unique: true });
// Zaprtje predala ali nova koda izbrišeta vse dovolilnice z eno operacijo.
fileInboxTicketSchema.index({ inboxId: 1 });
// TTL je SAMO pospravljanje zbirke. Nobena avtorizacijska odločitev se nanj ne zanaša: vsaka
// poizvedba dovolilnice ima `expiresAt: { $gt: now }` v pogoju, ker TTL monitor teče na ~60 s in
// zamika ne obljublja (research.md §13).
fileInboxTicketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type FileInboxTicketDoc = InferSchemaType<typeof fileInboxTicketSchema>;
export const FileInboxTicketModel = model('FileInboxTicket', fileInboxTicketSchema);
