import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../../core/api/api-base.js';
import type {
  Note,
  NoteAudio,
  NoteDraft,
  NotesCapabilities,
  NotesListResponse,
} from './notes.model.js';

// Odjemalec modula "Beležke". Uvaža samo iz `core/` in iz lastne mape — nikoli iz druge
// funkcionalnosti pod `features/` (člen I).

@Injectable({ providedIn: 'root' })
export class NotesApi {
  private readonly http = inject(HttpClient);

  list(params: { query?: string; tag?: string } = {}): Promise<NotesListResponse> {
    const search = new URLSearchParams();
    if (params.query?.trim()) search.set('query', params.query.trim());
    if (params.tag) search.set('tag', params.tag);
    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    return firstValueFrom(
      this.http.get<NotesListResponse>(apiUrl(`/notes${suffix}`), { withCredentials: true }),
    );
  }

  get(noteId: string): Promise<Note> {
    return firstValueFrom(this.http.get<Note>(apiUrl(`/notes/${noteId}`), { withCredentials: true }));
  }

  create(draft: NoteDraft): Promise<Note> {
    return firstValueFrom(this.http.post<Note>(apiUrl('/notes'), draft, { withCredentials: true }));
  }

  update(noteId: string, draft: Partial<NoteDraft>): Promise<Note> {
    return firstValueFrom(this.http.put<Note>(apiUrl(`/notes/${noteId}`), draft, { withCredentials: true }));
  }

  remove(noteId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(apiUrl(`/notes/${noteId}`), { withCredentials: true }));
  }

  capabilities(): Promise<NotesCapabilities> {
    return firstValueFrom(
      this.http.get<NotesCapabilities>(apiUrl('/notes/capabilities'), { withCredentials: true }),
    );
  }

  /** Naloži posnetek. Telo je surov `Blob`, `Content-Type` je vrsta posnetka — strežnik za to
   * pot uporablja `express.raw` (glej modules/notes/router.ts), ne multipart: ena datoteka na
   * zahtevo ne potrebuje ovoja, ki bi mu na strežniku sledila nova odvisnost.
   *
   * `transcribe` pošlje posnetek zunanji storitvi za prepis. Kliče se SAMO, kadar
   * `capabilities().serverTranscription.available` — sicer strežnik vrne 409 in posnetek se ne
   * naloži (zato ta zastavica ni nikoli privzeta). */
  uploadAudio(
    noteId: string,
    recording: { blob: Blob; mimeType: string; durationMs: number },
    options: { transcript?: string; transcribe?: boolean } = {},
  ): Promise<NoteAudio> {
    const search = new URLSearchParams({ durationMs: String(Math.round(recording.durationMs)) });
    if (options.transcript?.trim()) search.set('transcript', options.transcript.trim());
    if (options.transcribe) search.set('transcribe', 'true');
    return firstValueFrom(
      this.http.post<NoteAudio>(apiUrl(`/notes/${noteId}/audio?${search.toString()}`), recording.blob, {
        headers: { 'Content-Type': recording.mimeType },
        withCredentials: true,
      }),
    );
  }

  /** Posnetek se prenese prek HttpClienta in NE prek `<audio src="/api/...">`: naslov v
   * atributu `src` ne gre skozi prestreznik (core/auth/auth.interceptor.ts), zato bi bil brez
   * glave `Authorization` in bi vrnil 401. Klicatelj iz vrnjenega Bloba naredi `objectURL` in
   * ga po uporabi sprosti. */
  audioBlob(noteId: string, audioId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(apiUrl(`/notes/${noteId}/audio/${audioId}`), {
        responseType: 'blob',
        withCredentials: true,
      }),
    );
  }

  /** Prepis obstoječega posnetka na strežniku. Vrne posnetek z novim stanjem — tudi kadar je
   * prepis spodletel (`transcriptStatus: 'failed'` in razlog), zato tu ni izjeme, ki bi jo
   * bilo treba loviti kot napako zahteve. */
  transcribeAudio(noteId: string, audioId: string): Promise<NoteAudio> {
    return firstValueFrom(
      this.http.post<NoteAudio>(apiUrl(`/notes/${noteId}/audio/${audioId}/transcribe`), null, {
        withCredentials: true,
      }),
    );
  }

  removeAudio(noteId: string, audioId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(apiUrl(`/notes/${noteId}/audio/${audioId}`), { withCredentials: true }),
    );
  }
}
