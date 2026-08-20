import { Capacitor } from '@capacitor/core';

// FR-001: frontend uporablja izključno relativne poti `/api/v1/...`. Edina izjema je
// nativni Android build, ki nima izvora in zato potrebuje nastavljiv absolutni naslov
// (glej apps/web/capacitor.config.ts, `apiBase`). To je edino mesto v celotni aplikaciji,
// ki to izjemo pozna — noben drug del kode ne sestavlja absolutnih API naslovov.

const DEFAULT_ANDROID_API_BASE = 'https://app.si';

function readAndroidApiBase(): string {
  // Capacitor config injicira vrednosti prek `Capacitor.getConfig()` ob nativnem zagonu.
  const cfg = Capacitor.getPlatform() === 'android' ? (Capacitor as unknown as { getConfig?: () => { apiBase?: string } }).getConfig?.() : undefined;
  return cfg?.apiBase ?? DEFAULT_ANDROID_API_BASE;
}

export function apiBaseUrl(): string {
  if (Capacitor.getPlatform() === 'android') {
    return `${readAndroidApiBase()}/api/v1`;
  }
  return '/api/v1';
}

export function apiUrl(path: string): string {
  const base = apiBaseUrl();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
