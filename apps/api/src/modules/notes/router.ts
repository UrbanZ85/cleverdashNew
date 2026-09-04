import express, { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { loadEnv } from '../../platform/config/env.js';
import { requireScopes } from '../../platform/auth/scopes.js';
import { badRequest, notFound, ProblemError } from '../../platform/errors/problem.js';
import { readServerTranscriptionConsent } from '../../platform/settings/consent.service.js';
import { NoteModel } from './models/note.model.js';
import { NoteAudioModel } from './models/note-audio.model.js';
import {
  buildNotesFilter,
  deriveTitle,
  normalizeAudioMimeType,
  normalizeTags,
  noteWriteSchema,
  notesQuerySchema,
} from './domain/note-input.js';
import {
  describeTranscriptionBlock,
  transcriptionBlockReason,
  type TranscriptionAvailability,
} from './domain/transcription-gate.js';
import { transcribeAudio, TranscriptionFailedError } from './services/transcription.service.js';
import { NOTE_SCOPES } from './scopes.js';

// Endpointi pod /api/v1/notes* — glej specs/007-notes/contracts/openapi.yaml.
export const notesRouter = Router();

type NoteLean = {
  _id: unknown;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type AudioLean = {
  _id: unknown;
  mimeType: string;
  byteSize: number;
  durationMs: number | null;
  transcript: string | null;
  transcriptSource: string | null;
  transcriptStatus: string;
  transcriptError: string | null;
  createdAt: Date;
};

function toAudioResponse(doc: AudioLean) {
  return {
    id: String(doc._id),
    mimeType: doc.mimeType,
    byteSize: doc.byteSize,
    durationMs: doc.durationMs ?? null,
    transcript: doc.transcript ?? null,
    transcriptSource: doc.transcriptSource ?? null,
    transcriptStatus: doc.transcriptStatus ?? 'none',
    transcriptError: doc.transcriptError ?? null,
    createdAt: doc.createdAt,
  };
}

function toNoteResponse(doc: NoteLean, audio: AudioLean[] = []) {
  return {
    id: String(doc._id),
    title: doc.title,
    body: doc.body,
    tags: doc.tags ?? [],
    pinned: doc.pinned ?? false,
    audio: audio.map(toAudioResponse),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Neveljaven ObjectId bi v Mongoose vrgel CastError, ki se navzven pokaže kot 500 — za
 * uporabnika, ki je odprl staro povezavo, je to 404. */
function requireObjectId(value: string, what: string): string {
  if (!Types.ObjectId.isValid(value)) throw notFound(`${what} ne obstaja.`);
  return value;
}

/** Beležka tega uporabnika ali 404 — nikoli 403: obstoj tujega zapisa ni podatek, ki bi ga
 * kdo smel prebrati (enak vzorec kot pri kamerah po 004). */
async function findOwnNote(noteId: string, userId: string) {
  const note = await NoteModel.findOne({ _id: requireObjectId(noteId, 'Beležka'), userId });
  if (!note) throw notFound('Beležka ne obstaja.');
  return note;
}

/** Oba pogoja za prepis na strežniku. Bere jih platform (`platform/settings/consent.service.ts`),
 * ker `Settings` pripada drugemu modulu in člen I neposrednega uvoza ne dovoli. */
function resolveAvailability(userId: string): Promise<TranscriptionAvailability> {
  return readServerTranscriptionConsent(userId);
}

// ── Zmožnosti modula ─────────────────────────────────────────────────────────────────────
// MORA biti registrirana PRED `/notes/:noteId`, sicer bi usmerjevalnik "capabilities"
// razumel kot ID beležke (enak vzorec kot 'cameras/manage' pred 'cameras/:id' v web routah).
//
// Vmesnik potrebuje razliko med "skrbnik storitve ni nastavil" in "ti je nisi vklopil": prvo
// je stvar namestitve, drugo en klik v profilu. Brez tega endpointa bi gumb za prepis ali
// molčal ali lagal.
notesRouter.get('/notes/capabilities', requireScopes(NOTE_SCOPES.read), async (req, res, next) => {
  try {
    const availability = await resolveAvailability(req.auth!.subjectId);
    const reason = transcriptionBlockReason(availability);
    res.json({
      serverTranscription: {
        ...availability,
        available: reason === null,
        reason,
        detail: reason ? describeTranscriptionBlock(reason) : null,
      },
      audioMaxBytes: loadEnv().NOTES_AUDIO_MAX_MB * 1024 * 1024,
    });
  } catch (err) {
    next(err);
  }
});

// ── CRUD ─────────────────────────────────────────────────────────────────────────────────

notesRouter.get('/notes', requireScopes(NOTE_SCOPES.read), async (req, res, next) => {
  try {
    const params = notesQuerySchema.parse(req.query);
    const userId = req.auth!.subjectId;
    const filter = buildNotesFilter({ userId, query: params.query, tag: params.tag });
    const [notes, total, tags] = await Promise.all([
      NoteModel.find(filter)
        // Pripete najprej, nato najnovejše spremenjene — isti vrstni red kot indeks v
        // note.model.ts. Beležka, ki jo pravkar pišeš, mora biti na vrhu.
        .sort({ pinned: -1, updatedAt: -1 })
        .skip(params.offset)
        .limit(params.limit)
        .lean<NoteLean[]>(),
      NoteModel.countDocuments(filter),
      // Vse oznake tega uporabnika (ne le tiste iz trenutne strani) — vmesnik iz njih
      // sestavi filtre, ne da bi prebral vse beležke.
      NoteModel.distinct('tags', { userId }) as unknown as Promise<string[]>,
    ]);

    // Seznam pove, ali beležka ima posnetke, ne pa katere — sami posnetki se preberejo šele
    // ob odprtju beležke. Ena združevalna poizvedba namesto N+1 klicev.
    const counts = await NoteAudioModel.aggregate<{ _id: unknown; count: number }>([
      { $match: { noteId: { $in: notes.map((n) => new Types.ObjectId(String(n._id))) } } },
      { $group: { _id: '$noteId', count: { $sum: 1 } } },
    ]);
    const countByNote = new Map(counts.map((c) => [String(c._id), c.count]));

    res.json({
      notes: notes.map((note) => {
        const { audio: _audio, ...rest } = toNoteResponse(note);
        return { ...rest, audioCount: countByNote.get(String(note._id)) ?? 0 };
      }),
      total,
      tags: tags.filter((tag) => typeof tag === 'string' && tag.length > 0).sort(),
    });
  } catch (err) {
    next(err);
  }
});

notesRouter.post('/notes', requireScopes(NOTE_SCOPES.write), async (req, res, next) => {
  try {
    const body = noteWriteSchema.parse(req.body);
    const title = deriveTitle(body.title ?? '', body.body ?? '');
    if (title.length === 0) {
      throw badRequest('Beležka potrebuje naslov ali vsebino.');
    }
    const note = await NoteModel.create({
      userId: req.auth!.subjectId,
      title,
      body: body.body ?? '',
      tags: normalizeTags(body.tags ?? []),
      pinned: body.pinned ?? false,
    });
    res.status(201).json(toNoteResponse(note.toObject() as unknown as NoteLean));
  } catch (err) {
    next(err);
  }
});

notesRouter.get('/notes/:noteId', requireScopes(NOTE_SCOPES.read), async (req, res, next) => {
  try {
    const note = await findOwnNote(String(req.params.noteId), req.auth!.subjectId);
    const audio = await NoteAudioModel.find({ noteId: note._id }).sort({ createdAt: 1 }).lean<AudioLean[]>();
    res.json(toNoteResponse(note.toObject() as unknown as NoteLean, audio));
  } catch (err) {
    next(err);
  }
});

notesRouter.put('/notes/:noteId', requireScopes(NOTE_SCOPES.write), async (req, res, next) => {
  try {
    const body = noteWriteSchema.parse(req.body);
    const note = await findOwnNote(String(req.params.noteId), req.auth!.subjectId);

    // Delna posodobitev: navedejo se samo polja, ki se spremenijo (enak dogovor kot
    // PUT /settings). Prazen niz je pomenska vrednost ("pobriši vsebino") in se zato loči od
    // `undefined` ("ne spreminjaj") — ne prek `??`.
    if (body.body !== undefined) note.body = body.body;
    if (body.title !== undefined || body.body !== undefined) {
      note.title = deriveTitle(body.title ?? note.title, note.body);
    }
    if (body.tags !== undefined) note.tags = normalizeTags(body.tags);
    if (body.pinned !== undefined) note.pinned = body.pinned;

    if (note.title.trim().length === 0) {
      throw badRequest('Beležka potrebuje naslov ali vsebino.');
    }
    await note.save();

    const audio = await NoteAudioModel.find({ noteId: note._id }).sort({ createdAt: 1 }).lean<AudioLean[]>();
    res.json(toNoteResponse(note.toObject() as unknown as NoteLean, audio));
  } catch (err) {
    next(err);
  }
});

notesRouter.delete('/notes/:noteId', requireScopes(NOTE_SCOPES.write), async (req, res, next) => {
  try {
    const note = await findOwnNote(String(req.params.noteId), req.auth!.subjectId);
    // Posnetki se izbrišejo PRED beležko: obraten vrstni red bi ob napaki med brisanjem
    // pustil posnetke brez beležke, torej podatke, ki jih ni mogoče več niti videti niti
    // izbrisati, zasedajo pa prostor.
    await NoteAudioModel.deleteMany({ noteId: note._id });
    await note.deleteOne();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ── Zvok ─────────────────────────────────────────────────────────────────────────────────

const audioUploadQuerySchema = z.object({
  durationMs: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 60 * 60 * 1000)
    .optional(),
  /** Prepis, ki ga je naredil BRSKALNIK med narekovanjem (Web Speech API) — pride skupaj s
   * posnetkom, da sta shranjena kot en zapis. */
  transcript: z.string().max(100_000).optional(),
  /** Zahteva za prepis na strežniku. Privzeto `false`: posnetek brez izrecne zahteve nikoli
   * ne zapusti tega strežnika. */
  transcribe: z
    .enum(['true', 'false', '1', '0'])
    .transform((v) => v === 'true' || v === '1')
    .optional(),
});

/** `express.raw` samo za to pot: telo je binarni posnetek, ne JSON. Globalni `express.json()`
 * v main.ts se ga ne dotakne (razume samo `application/json`), zato se ne motita.
 *
 * Meja je ISTA kot `NOTES_AUDIO_MAX_MB` — Express zavrne prevelik posnetek že med branjem
 * toka, torej strežnik nikoli ne drži v pomnilniku česa, kar bi tako ali tako zavrnil.
 * `loadEnv()` se bere ob vsaki zahtevi in ne enkrat ob uvozu modula, ker testi okolje
 * prepišejo (setTestEnv) po tem, ko je modul že uvožen. */
const audioBodyParser: express.RequestHandler = (req, res, next) => {
  const maxMb = loadEnv().NOTES_AUDIO_MAX_MB;
  express.raw({ type: ['audio/*', 'video/webm'], limit: `${maxMb}mb` })(req, res, (err: unknown) => {
    // Prevelik posnetek zavrne že `express.raw` — a s svojo napako, ki bi jo obravnavalec na
    // koncu verige razumel kot nepričakovano in vrnil `500` ("Prišlo je do nepričakovane
    // napake"). To je natanko tista vrsta neuporabnega sporočila, ki uporabnika pusti brez
    // vednosti, da je posnetek preprosto predolg.
    if (err && (err as { type?: string }).type === 'entity.too.large') {
      next(new ProblemError(413, 'Posnetek je prevelik', `Največja velikost posnetka je ${maxMb} MB.`));
      return;
    }
    next(err);
  });
};

notesRouter.post(
  '/notes/:noteId/audio',
  requireScopes(NOTE_SCOPES.write),
  audioBodyParser,
  async (req, res, next) => {
    try {
      const params = audioUploadQuerySchema.parse(req.query);
      const note = await findOwnNote(String(req.params.noteId), req.auth!.subjectId);

      const mimeType = normalizeAudioMimeType(req.header('content-type'));
      if (!mimeType) {
        throw new ProblemError(
          415,
          'Nepodprta vrsta zvoka',
          'Content-Type mora biti eden od: audio/webm, audio/ogg, audio/mp4, audio/mpeg, audio/wav, audio/aac.',
        );
      }
      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (buffer.byteLength === 0) throw badRequest('Posnetek je prazen.');

      const browserTranscript = params.transcript?.trim() ?? '';
      let transcript: string | null = browserTranscript.length > 0 ? browserTranscript : null;
      let transcriptSource: 'browser' | 'server' | null = transcript ? 'browser' : null;
      let transcriptStatus: 'none' | 'done' | 'failed' = transcript ? 'done' : 'none';
      let transcriptError: string | null = null;

      if (params.transcribe) {
        // Dvojna ključavnica (domain/transcription-gate.ts): ključ v okolju IN osebno
        // stikalo. Brez katere koli od njiju posnetek ne gre nikamor.
        const availability = await resolveAvailability(req.auth!.subjectId);
        const reason = transcriptionBlockReason(availability);
        if (reason) {
          throw new ProblemError(409, 'Prepis na strežniku ni na voljo', describeTranscriptionBlock(reason));
        }
        try {
          transcript = await transcribeAudio({ buffer, mimeType, env: loadEnv(), logger: req.log });
          transcriptSource = 'server';
          transcriptStatus = 'done';
        } catch (err) {
          // Posnetek se shrani tudi ob spodletelem prepisu, z zabeleženim razlogom (člen VI:
          // tiha napaka je hrošč). Uporabnik lahko poskusi znova prek /transcribe.
          transcriptStatus = 'failed';
          transcriptError = err instanceof TranscriptionFailedError ? err.message : 'Prepis je spodletel.';
        }
      }

      const audio = await NoteAudioModel.create({
        noteId: note._id,
        userId: req.auth!.subjectId,
        mimeType,
        byteSize: buffer.byteLength,
        durationMs: params.durationMs ?? null,
        data: buffer,
        transcript,
        transcriptSource,
        transcriptStatus,
        transcriptError,
      });

      // Beležka se "dotakne", da posnetek dvigne njeno mesto v seznamu — sicer bi beležka,
      // v katero si pravkar govoril, ostala tam, kjer je bila po zadnjem tipkanju.
      note.set('updatedAt', new Date());
      await note.save();

      res.status(201).json(toAudioResponse(audio.toObject() as unknown as AudioLean));
    } catch (err) {
      next(err);
    }
  },
);

notesRouter.get('/notes/:noteId/audio/:audioId', requireScopes(NOTE_SCOPES.read), async (req, res, next) => {
  try {
    const note = await findOwnNote(String(req.params.noteId), req.auth!.subjectId);
    // `+data` je nujen: polje ima `select: false` (glej note-audio.model.ts), da ga noben
    // seznam ne prenese po nesreči.
    const audio = await NoteAudioModel.findOne({
      _id: requireObjectId(String(req.params.audioId), 'Posnetek'),
      noteId: note._id,
    }).select('+data');
    if (!audio) throw notFound('Posnetek ne obstaja.');

    res.setHeader('Content-Type', audio.mimeType);
    res.setHeader('Content-Length', String(audio.byteSize));
    // Zvok je osebni podatek — nikoli v skupni predpomnilnik posrednika (člen II: pred tem
    // endpointom je Caddy na istem izvoru).
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(audio.data);
  } catch (err) {
    next(err);
  }
});

/** Prepis obstoječega posnetka na zahtevo — za posnetke, narejene brez prepisa, in za
 * ponovni poskus po spodleteli storitvi. Ista dvojna ključavnica kot pri nalaganju. */
notesRouter.post(
  '/notes/:noteId/audio/:audioId/transcribe',
  requireScopes(NOTE_SCOPES.write),
  async (req, res, next) => {
    try {
      const note = await findOwnNote(String(req.params.noteId), req.auth!.subjectId);
      const availability = await resolveAvailability(req.auth!.subjectId);
      const reason = transcriptionBlockReason(availability);
      if (reason) {
        throw new ProblemError(409, 'Prepis na strežniku ni na voljo', describeTranscriptionBlock(reason));
      }

      const audio = await NoteAudioModel.findOne({
        _id: requireObjectId(String(req.params.audioId), 'Posnetek'),
        noteId: note._id,
      }).select('+data');
      if (!audio) throw notFound('Posnetek ne obstaja.');

      try {
        audio.transcript = await transcribeAudio({
          buffer: Buffer.from(audio.data as unknown as Uint8Array),
          mimeType: audio.mimeType,
          env: loadEnv(),
          logger: req.log,
        });
        audio.transcriptSource = 'server';
        audio.transcriptStatus = 'done';
        audio.transcriptError = null;
      } catch (err) {
        audio.transcriptStatus = 'failed';
        audio.transcriptError = err instanceof TranscriptionFailedError ? err.message : 'Prepis je spodletel.';
      }
      await audio.save();

      // Spodletel prepis NI napaka zahteve: posnetek je nespremenjen, stanje je zapisano in
      // uporabnik ga vidi v odgovoru (`transcriptStatus: "failed"` + razlog). 502 bi vmesniku
      // vzel prav tisti podatek, zaradi katerega je klical.
      res.status(200).json(toAudioResponse(audio.toObject() as unknown as AudioLean));
    } catch (err) {
      next(err);
    }
  },
);

notesRouter.delete('/notes/:noteId/audio/:audioId', requireScopes(NOTE_SCOPES.write), async (req, res, next) => {
  try {
    const note = await findOwnNote(String(req.params.noteId), req.auth!.subjectId);
    const result = await NoteAudioModel.deleteOne({
      _id: requireObjectId(String(req.params.audioId), 'Posnetek'),
      noteId: note._id,
    });
    if (result.deletedCount === 0) throw notFound('Posnetek ne obstaja.');
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
