import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../api/api-base.js';

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  scopes: string[];
  lastLoginAt: string | null;
}

// `GET /auth/me` obstaja od 004, a ga do zdaj ni klical nihče — aplikacija nikjer ni
// pokazala, KDO je prijavljen, in ni imela gumba za odjavo. Meni oboje potrebuje.
@Injectable({ providedIn: 'root' })
export class CurrentUserService {
  private readonly http = inject(HttpClient);
  private readonly userSignal = signal<CurrentUser | null>(null);
  private inFlight: Promise<void> | null = null;

  readonly user = this.userSignal.asReadonly();

  /** Naloži enkrat na sejo; sočasni klicatelji (meni in spodnja vrstica zavihkov se
   * inicializirata skupaj) si delijo isto zahtevo. */
  async ensureLoaded(): Promise<void> {
    if (this.userSignal()) return;
    this.inFlight ??= this.load().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async load(): Promise<void> {
    try {
      const user = await firstValueFrom(
        this.http.get<CurrentUser>(apiUrl('/auth/me'), { withCredentials: true }),
      );
      this.userSignal.set(user);
    } catch {
      // Meni deluje tudi brez imena uporabnika — prijava sama je že preverjena z
      // `authGuard`, zato tu ni razloga za napako na zaslonu.
    }
  }

  clear(): void {
    this.userSignal.set(null);
  }

  /** Začetnici za znak v meniju; prazno ime da vprašaj, ne prazen krog. */
  initials(): string {
    const name = this.userSignal()?.displayName?.trim();
    if (!name) return '?';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  }
}
