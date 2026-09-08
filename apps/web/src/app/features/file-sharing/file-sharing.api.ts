import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpEventType, type HttpEvent } from '@angular/common/http';
import { firstValueFrom, type Subscription } from 'rxjs';
import { apiUrl } from '../../core/api/api-base.js';
import type {
  CreateInboxInput,
  CreatedFile,
  CreatedInbox,
  DeclaredUpload,
  DropInfo,
  DropReceipt,
  DropSession,
  ExpiryChoice,
  FileInbox,
  FilesListResponse,
  InboxesResponse,
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

  // ── 009b: sprejemni predali, lastnikova stran ─────────────────────────────────────────

  listInboxes(): Promise<InboxesResponse> {
    return firstValueFrom(this.http.get<InboxesResponse>(apiUrl('/inboxes'), { withCredentials: true }));
  }

  createInbox(input: CreateInboxInput): Promise<CreatedInbox> {
    const body: Record<string, unknown> = { label: input.label };
    if (input.note) body.note = input.note;
    // `undefined` pomeni "uporabi privzetek namestitve", izrecni `null` pomeni BREZ ROKA —
    // razlika, ki jo je treba ohraniti vse do strežnika (enako kot pri nalaganju).
    if (input.expiresInDays !== undefined) body.expiresInDays = input.expiresInDays;
    if (input.maxFiles !== undefined) body.maxFiles = input.maxFiles;
    if (input.maxTotalMb !== undefined) body.maxTotalMb = input.maxTotalMb;
    return firstValueFrom(this.http.post<CreatedInbox>(apiUrl('/inboxes'), body, { withCredentials: true }));
  }

  closeInbox(inboxId: string): Promise<FileInbox> {
    return firstValueFrom(
      this.http.post<FileInbox>(apiUrl(`/inboxes/${inboxId}/close`), {}, { withCredentials: true }),
    );
  }

  regenerateInboxCode(inboxId: string): Promise<CreatedInbox> {
    return firstValueFrom(
      this.http.post<CreatedInbox>(apiUrl(`/inboxes/${inboxId}/code`), {}, { withCredentials: true }),
    );
  }

  removeInbox(inboxId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(apiUrl(`/inboxes/${inboxId}`), { withCredentials: true }));
  }

  // ── 009b: javna stran za oddajo (brez prijave) ────────────────────────────────────────
  //
  // Te tri metode kliče `/u/:token`. `auth.interceptor.ts` na `/api/v1/drop/` ne pripenja glave
  // `Authorization` — potekla seja v brskalniku ne sme pokvariti strani, ki s sejo nima zveze.
  //
  // `withCredentials` tu NI in ne sme biti: dovolilnica za oddajo ne potuje v piškotku, ampak v
  // glavi `X-Drop-Ticket`, ki jo pripenjamo izrecno (FR-091). Piškotek bi brskalnik pošiljal sam
  // tudi pri zahtevi, ki bi jo sprožila tuja stran — pri poti, ki piše na disk, je to razlika
  // med ublaženim in odpravljenim tveganjem.

  dropInfo(token: string): Promise<DropInfo> {
    return firstValueFrom(this.http.get<DropInfo>(apiUrl(`/drop/${token}`)));
  }

  dropUnlock(token: string, code: string): Promise<DropSession> {
    return firstValueFrom(this.http.post<DropSession>(apiUrl(`/drop/${token}/unlock`), { code }));
  }

  /**
   * Oddaja je DVOSTOPENJSKA, iz istega razloga kot lastnikovo nalaganje (research.md §3): meje se
   * preverijo, preden priteče prvi bajt. Pošiljatelj tako dobi razumljivo zavrnitev in ne
   * prekinjene povezave sredi pošiljanja.
   *
   * Telo drugega koraka je `File`, ne `FormData`: XHR datoteko pretaka z diska in je ne naloži v
   * pomnilnik brskalnika — enako, kot je strežnik ne zbere v `Buffer`.
   */
  async dropUpload(
    token: string,
    ticket: string,
    file: File,
    senderName: string | null,
  ): Promise<DropReceipt> {
    const body: Record<string, unknown> = { fileName: file.name, byteSize: file.size };
    if (file.type) body.mimeType = file.type;
    if (senderName) body.senderName = senderName;

    const declared = await firstValueFrom(
      this.http.post<DeclaredUpload>(apiUrl(`/drop/${token}/files`), body, {
        headers: { 'X-Drop-Ticket': ticket },
      }),
    );

    this.progress.set({ fileName: file.name, loaded: 0, total: file.size });

    try {
      return await new Promise<DropReceipt>((resolve, reject) => {
        this.current = this.http
          .put<DropReceipt>(apiUrl(`/drop/${token}/files/${declared.id}/content`), file, {
            headers: {
              'X-Drop-Ticket': ticket,
              'Content-Type': file.type || 'application/octet-stream',
            },
            reportProgress: true,
            observe: 'events',
          })
          .subscribe({
            next: (event: HttpEvent<DropReceipt>) => {
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
    }
  }
}
