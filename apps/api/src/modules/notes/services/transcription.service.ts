import type { Env } from '../../../platform/config/env.js';
import type { Logger } from '../../../platform/logging/logger.js';
import { audioFileName } from '../domain/transcription-gate.js';

// Odjemalec za storitev prepisa govora. Namenoma govori OpenAI-jev protokol
// `POST /v1/audio/transcriptions` (multipart, polja `file`/`model`/`language`), ker ga poleg
// OpenAI-ja govorijo tudi samostojne različice (whisper.cpp `server`, faster-whisper-server,
// Groq) — naslov je nastavljiv, zato ta modul ne veže namestitve na enega ponudnika in
// posnetki lahko ostanejo v lastnem omrežju, če je tam postavljen svoj Whisper.
//
// Vratar (ali se sme klicati) NI tukaj: odločitev je v domain/transcription-gate.ts, stanje
// obeh pogojev pa prebere platform/settings/consent.service.ts.

export class TranscriptionFailedError extends Error {}

/** Pošlje posnetek storitvi za prepis in vrne besedilo. Klicatelj MORA pred tem preveriti
 * `transcriptionBlockReason(...)` — ta funkcija privolitve ne preverja, samo izvede klic. */
export async function transcribeAudio(params: {
  buffer: Buffer;
  mimeType: string;
  env: Env;
  logger: Logger;
}): Promise<string> {
  const { buffer, mimeType, env, logger } = params;
  const url = env.NOTES_TRANSCRIPTION_URL;
  const apiKey = env.NOTES_TRANSCRIPTION_API_KEY;
  if (!url || !apiKey) {
    throw new TranscriptionFailedError('Storitev za prepis ni nastavljena.');
  }

  const form = new FormData();
  // `Buffer` je `Uint8Array`, a `Blob` zahteva svojo kopijo z ustrezno vrsto vsebine.
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), audioFileName(mimeType));
  form.append('model', env.NOTES_TRANSCRIPTION_MODEL);
  // Jezik se navede izrecno: samodejno zaznavanje slovenščino pogosto prepozna kot hrvaščino
  // ali slovaščino in prepis je potem uporabno neuporaben.
  form.append('language', env.NOTES_TRANSCRIPTION_LANGUAGE);
  form.append('response_format', 'json');

  // Člen VIII (vljudnost do zunanjih virov): klic ima svojo časovno omejitev in nikoli ne
  // visi neomejeno — prepis desetminutnega posnetka traja lahko minuto, brskalnik pa medtem
  // čaka na odgovor.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.NOTES_TRANSCRIPTION_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      // Telo napake se zabeleži, a se uporabniku NE vrne: lahko vsebuje podrobnosti o
      // ponudniku in o zahtevi, ki v vmesniku ne pomenijo nič.
      const detail = (await res.text().catch(() => '')).slice(0, 500);
      logger.warn(
        { event: 'notes.transcription.failed', status: res.status, detail },
        'Storitev za prepis je vrnila napako',
      );
      throw new TranscriptionFailedError(`Storitev za prepis je vrnila napako ${res.status}.`);
    }

    const payload = (await res.json()) as { text?: unknown };
    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    if (text.length === 0) {
      throw new TranscriptionFailedError('Storitev za prepis ni vrnila besedila.');
    }
    logger.info(
      { event: 'notes.transcription.done', bytes: buffer.byteLength, durationMs: Date.now() - startedAt },
      'Posnetek prepisan',
    );
    return text;
  } catch (err) {
    if (err instanceof TranscriptionFailedError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new TranscriptionFailedError('Storitev za prepis se ni odzvala pravočasno.');
    }
    logger.warn({ event: 'notes.transcription.error', err }, 'Klic storitve za prepis je spodletel');
    throw new TranscriptionFailedError('Storitve za prepis ni bilo mogoče doseči.');
  } finally {
    clearTimeout(timeout);
  }
}
