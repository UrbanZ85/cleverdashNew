import { Schema, model, type InferSchemaType } from 'mongoose';

/** Kdo je naredil prepis: brskalnik (Web Speech API, med narekovanjem) ali strežnik
 * (zunanja storitev za prepis — samo ob dvojni privolitvi, glej services/transcription.service.ts). */
export const TRANSCRIPT_SOURCES = ['browser', 'server'] as const;

// Zvok je shranjen v Mongu kot `Buffer`, ne na datotečnem sistemu in ne v GridFS:
//  - datotečni sistem bi zahteval nov trajni nosilec v infra/docker-compose.yml in bi se
//    razšel z varnostno kopijo baze (posnetek bi lahko preživel svojo beležko ali obratno);
//  - GridFS je pravi odgovor za datoteke, VEČJE od 16 MB, česar tu ni: zgornja meja je
//    NOTES_AUDIO_MAX_MB (privzeto 10), kar je pri opusu ~24 kbit/s več kot ura govora.
// `select: false` pomeni, da noben seznam posnetkov ne prenese samih bajtov — te prebere
// izključno endpoint za predvajanje, ki jih izrecno zahteva.
const noteAudioSchema = new Schema(
  {
    noteId: { type: Schema.Types.ObjectId, ref: 'Note', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    mimeType: { type: String, required: true },
    byteSize: { type: Number, required: true },
    /** Kar je izmeril brskalnik ob snemanju; `null`, kadar tega ni sporočil. Trajanja
     * NAMENOMA ne izračunavamo iz posnetka — za to bi bil potreben dekodirnik zvoka na
     * strežniku, prikaz "1:12" pa ni vreden te odvisnosti. */
    durationMs: { type: Number, default: null },
    data: { type: Buffer, required: true, select: false },
    transcript: { type: String, default: null },
    transcriptSource: { type: String, enum: TRANSCRIPT_SOURCES, default: null },
    /** `failed` je pomembnejši od odsotnosti prepisa: uporabnik mora izvedeti, da je poskus
     * prepisa spodletel, ne le da prepisa ni (člen VI — tiha napaka je hrošč). */
    transcriptStatus: { type: String, enum: ['none', 'done', 'failed'], default: 'none' },
    transcriptError: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);

noteAudioSchema.index({ noteId: 1, createdAt: 1 });
noteAudioSchema.index({ userId: 1 });

export type NoteAudioDoc = InferSchemaType<typeof noteAudioSchema>;
export const NoteAudioModel = model('NoteAudio', noteAudioSchema);
