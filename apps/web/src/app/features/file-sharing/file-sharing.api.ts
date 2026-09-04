import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpEventType, type HttpEvent } from '@angular/common/http';
import { firstValueFrom, type Subscription } from 'rxjs';
import { apiUrl } from '../../core/api/api-base.js';
import type {
  CreatedFile,
  ExpiryChoice,
  FilesListResponse,
  PublicShareInfo,
  SharedFile,
  UnlockResult,
  UploadResult,
} from './file-sharing.model.js';

// Odjemalec modula "Deljenje datotek". Uvaža samo iz `core/` in iz lastne mape — nikoli iz druge
// funkcionalnosti pod `features/` (člen I).

export interface UploadProgress {
  fileName: string;
  loaded: number;
  total: number;
}

@Injectable({ providedIn: 'root' })
export class FileSharingApi {
  private readonly http = inject(HttpClient);

  /** Napredek nalaganja, ki TEČE. Živi v storitvi in ne v komponenti strani: 500 MB se na
   * domači povezavi nalaga minute, in nalaganje, ki se prekine, ker je uporabnik pogledal
   * koledar, bi bilo neuporabno (research.md §23). */
  readonly progress = signal<UploadProgress | null>(null);

  private current: Subscription | null = null;

  list(): Promise<FilesListResponse> {
    return firstValueFrom(this.http.get<FilesListResponse>(apiUrl('/files'), { withCredentials: true }));
  }

  get(fileId: string): Promise<SharedFile> {
    return firstValueFrom(this.http.get<SharedFile>(apiUrl(`/files/${fileId}`), { withCredentials: true }));
  }

  revoke(fileId: string): Promise<SharedFile> {
    return firstValueFrom(
      this.http.post<SharedFile>(apiUrl(`/files/${fileId}/revoke`), {}, { withCredentials: true }),
    );
  }

  regeneratePassword(fileId: string): Promise<UploadResult> {
    return firstValueFrom(
      this.http.post<UploadResult>(apiUrl(`/files/${fileId}/password`), {}, { withCredentials: true }),
    );
  }

  remove(fileId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(apiUrl(`/files/${fileId}`), { withCredentials: true }));
  }

  /**
   * Nalaganje je DVOSTOPENJSKO (research.md §3): najprej napoved (kvota in meja se preverita,
   * preden priteče prvi bajt), nato vsebina.
   *
   * Telo drugega koraka je `File`, ne `FormData`: XHR datoteko pretaka z diska in je ne naloži
   * v pomnilnik brskalnika — enako, kot je na strežniku ne zbere v `Buffer`. `multipart` bi
   * pomenil ovoj, ki mu na strežniku sledi nova odvisnost, in nič drugega.
   */
  async upload(file: File, expiresInDays: ExpiryChoice | undefined, onCancelled?: () => void): Promise<UploadResult> {
    const body: Record<string, unknown> = { fileName: file.name, byteSize: file.size };
    if (file.type) body.mimeType = file.type;
    // `undefined` pomeni "uporabi privzetek namestitve", izrecni `null` pomeni BREZ ROKA —
    // razlika, ki jo je treba ohraniti vse do strežnika.
    if (expiresInDays !== undefined) body.expiresInDays = expiresInDays;

    const created = await firstValueFrom(
      this.http.post<CreatedFile>(apiUrl('/files'), body, { withCredentials: true }),
    );

    this.progress.set({ fileName: file.name, loaded: 0, total: file.size });

    try {
      return await new Promise<UploadResult>((resolve, reject) => {
        this.current = this.http
          .put<UploadResult>(apiUrl(`/files/${created.id}/content`), file, {
            withCredentials: true,
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            reportProgress: true,
            observe: 'events',
          })
          .subscribe({
            next: (event: HttpEvent<UploadResult>) => {
              if (event.type === HttpEventType.UploadProgress) {
                this.progress.set({ fileName: file.name, loaded: event.loaded, total: event.total ?? file.size });
              } else if (event.type === HttpEventType.Response && event.body) {
                resolve(event.body);
              }
            },
            error: (err: unknown) => reject(err),
          });
      });
    } finally {
      this.current = null;
      this.progress.set(null);
      if (onCancelled) onCancelled();
    }
  }

  /** Preklic nalaganja: `unsubscribe` prekine XHR, čemur na strežniku sledi `aborted` in
   * odstranitev delne datoteke (FR-006). */
  cancelUpload(): void {
    this.current?.unsubscribe();
    this.current = null;
    this.progress.set(null);
  }

  // ── Javna stran (brez prijave) ────────────────────────────────────────────────────────
  //
  // Te tri metode kliče `/d/:token`, do katere pride človek BREZ računa. `auth.interceptor.ts`
  // na te poti ne pripenja glave `Authorization` — potekla seja v brskalniku ne sme pokvariti
  // strani, ki s sejo nima nobene zveze (research.md §2).

  publicInfo(token: string): Promise<PublicShareInfo> {
    return firstValueFrom(this.http.get<PublicShareInfo>(apiUrl(`/share/${token}`)));
  }

  unlock(token: string, password: string): Promise<UnlockResult> {
    // `withCredentials` je tu OBVEZEN: odgovor postavi piškotek z dovolilnico, brez katerega
    // prenosa ni (research.md §8).
    return firstValueFrom(
      this.http.post<UnlockResult>(apiUrl(`/share/${token}/unlock`), { password }, { withCredentials: true }),
    );
  }
}
