import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../api/api-base.js';
import { TokenStore } from './token.store.js';

interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
  mustChangePassword: boolean;
}

// FR-011: dostopni žeton se v ozadju obnovi, uporabnik ne opazi ničesar. Ta storitev je
// edino mesto, ki kliče /auth/login, /auth/refresh in /auth/logout.
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly tokenStore = inject(TokenStore);

  private readonly mustChangePasswordSignal = signal(false);
  readonly mustChangePassword = this.mustChangePasswordSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.tokenStore.accessToken() !== null);

  async login(email: string, password: string, deviceLabel?: string): Promise<void> {
    const platform = Capacitor.getPlatform() === 'android' ? 'android' : 'web';
    const res = await firstValueFrom(
      this.http.post<TokenResponse>(
        apiUrl('/auth/login'),
        { email, password, deviceLabel, platform },
        { withCredentials: true },
      ),
    );
    await this.applyTokenResponse(res);
  }

  /** Tiha obnova: kliče se iz interceptorja ob 401. Vrne `false`, če obnova ni uspela —
   * takrat interceptor sproži odjavo. */
  async silentRefresh(): Promise<boolean> {
    try {
      const refreshToken = await this.tokenStore.getRefreshToken();
      const res = await firstValueFrom(
        this.http.post<TokenResponse>(
          apiUrl('/auth/refresh'),
          refreshToken ? { refreshToken } : {},
          { withCredentials: true },
        ),
      );
      await this.applyTokenResponse(res);
      return true;
    } catch {
      return false;
    }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await firstValueFrom(
      this.http.post(
        apiUrl('/auth/password'),
        { currentPassword, newPassword },
        { withCredentials: true },
      ),
    );
    this.mustChangePasswordSignal.set(false);
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post(apiUrl('/auth/logout'), {}, { withCredentials: true }));
    } finally {
      this.tokenStore.clear();
      await this.router.navigate(['/login']);
    }
  }

  private async applyTokenResponse(res: TokenResponse): Promise<void> {
    this.tokenStore.setAccessToken(res.accessToken);
    this.mustChangePasswordSignal.set(res.mustChangePassword);
    if (res.refreshToken) {
      await this.tokenStore.setRefreshToken(res.refreshToken);
    }
    if (res.mustChangePassword) {
      await this.router.navigate(['/change-password']);
    }
  }
}
