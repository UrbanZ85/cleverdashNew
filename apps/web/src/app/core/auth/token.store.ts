import { Injectable, signal } from '@angular/core';

// 004, research.md §1: poenostavljeno — dostopni žeton živi samo v pomnilniku odjemalca
// (nikoli na disku), za web IN Android enako. Seja sama je httpOnly piškotek, ki ga
// odjemalec sploh ne vidi (Capacitorjev Android WebView ga deli z lastnimi HTTP klici
// enako kot pravi brskalnik) — zato tu ni več nič v zvezi z `@capacitor/preferences`.
//
// Poleg žetona se hrani tudi njegov ITEK. Brez njega odjemalec ni imel načina, da bi vedel,
// kdaj je žeton star — obnovil ga je šele, ko je zahteva padla s 401 (glej token-lifetime.ts).
@Injectable({ providedIn: 'root' })
export class TokenStore {
  private readonly accessTokenSignal = signal<string | null>(null);
  private readonly expiresAtSignal = signal<number | null>(null);

  readonly accessToken = this.accessTokenSignal.asReadonly();
  /** Epoch ms izteka žetona, ali `null`, kadar ni znan. */
  readonly expiresAt = this.expiresAtSignal.asReadonly();

  setAccessToken(token: string | null, expiresAt: number | null = null): void {
    this.accessTokenSignal.set(token);
    this.expiresAtSignal.set(token === null ? null : expiresAt);
  }

  clear(): void {
    this.accessTokenSignal.set(null);
    this.expiresAtSignal.set(null);
  }
}
