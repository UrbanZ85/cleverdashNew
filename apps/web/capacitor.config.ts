import type { CapacitorConfig } from '@capacitor/cli';

// research.md §1.1, FR-001, FR-005: nativni Android build je edino mesto, ki pozna
// absolutni naslov strežnika. Privzeto https://app.si; nastavljivo prek env var ob
// gradnji za razvojne buildove (npr. proti localhost med testiranjem na napravi).
const config: CapacitorConfig = {
  appId: 'si.app.cleverdash',
  appName: 'CleverDash',
  webDir: 'www',
  server: {
    androidScheme: 'https',
  },
  android: {
    buildOptions: {},
  },
  plugins: {
    // Vrednost, ki jo apps/web/src/app/core/api/api-base.ts prebere prek Capacitor.getConfig().
    // @ts-expect-error — apiBase ni del standardnega CapacitorConfig tipa, je naša razširitev.
    apiBase: process.env['CLEVERDASH_API_BASE'] ?? 'https://app.si',
  },
};

export default config;
