import { describe, expect, it } from 'vitest';
import { REGISTERED_ICONS, AVAILABLE_ICON_NAMES } from '../../src/app/core/icons/register-icons.js';
import { PLUGIN_KIND_ICONS } from '../../src/app/core/plugins/plugin.model.js';

// Imena ikon za meni prihajajo s STREŽNIKA (apps/api/src/platform/tabs/registry.ts,
// TabDefinition.icon), zato jih prevajalnik ne more preveriti: nov zavihek z neregistrirano
// ikono se izriše brez nje in nihče tega ne opazi, dokler ne pogleda menija. Ta test je
// edina mreža pod tem.
//
// Seznam spodaj je NAMENOMA prepisan iz strežniškega registra, ne uvožen — apps/web ne sme
// uvažati iz apps/api (ločena projekta, člen I). Ko se register spremeni, se test pokvari,
// in to je točno njegov namen.
const TAB_REGISTRY_ICONS = [
  'home-outline', // dashboard — Nadzorna plošča
  'reader-outline', // notes — Beležke
  'time-outline', // time-tracking — Beleženje časa
  'videocam-outline', // cameras — Kamere
  'document-text-outline', // timesheet — Evidenca delovnega časa
  'cloud-upload-outline', // file-sharing — Deljenje datotek (009, privzeto izklopljen)
  'checkbox-outline', // todos — Opravila (010)
  'settings-outline', // settings — Nastavitve
];

// 010: ikone, ki jih zavihek Opravila uporablja v svojih predlogah. Prevajalnik jih ne
// preveri nič bolj kot ikone iz registra zavihkov — ime je niz, neregistrirano ime pa se
// izriše kot prazen prostor.
const TODOS_ICONS = [
  'square-outline', // neodkljukano opravilo
  'checkmark-done-outline', // "Počisti opravljene"
  'lock-closed-outline', // zaklenjen seznam
  'people-outline', // deljenje
  'calendar-outline', // rok
  'arrow-up-outline', // vrstni red
  'arrow-down-outline',
  'add-outline', // nov seznam / novo opravilo
  'ellipsis-vertical', // meni seznama
];

describe('register-icons', () => {
  it('registrira vsako ikono, ki jo uporablja strežniški register zavihkov', () => {
    for (const name of TAB_REGISTRY_ICONS) {
      expect(AVAILABLE_ICON_NAMES, `ikona "${name}" iz registra zavihkov ni registrirana`).toContain(name);
    }
  });

  it('registrira vsako ikono, ki jo uporablja zavihek Opravila (010)', () => {
    for (const name of TODOS_ICONS) {
      expect(AVAILABLE_ICON_NAMES, `ikona "${name}" iz zavihka Opravila ni registrirana`).toContain(name);
    }
  });

  it('vsak vnos ima neprazen SVG niz — prazna vrednost izriše prazen prostor', () => {
    for (const [name, svg] of Object.entries(REGISTERED_ICONS)) {
      expect(typeof svg, `ikona "${name}"`).toBe('string');
      expect(svg.length, `ikona "${name}" je prazna`).toBeGreaterThan(0);
    }
  });

  it('privzeta ikona vsake vrste vtičnika je registrirana', () => {
    // Ta test je nastal iz prave napake: PLUGIN_KIND_ICONS je predlagal "browsers-outline"
    // za vrsto iframe, ki pa ni bila registrirana — ploščica je ostala brez ikone.
    for (const [kind, icon] of Object.entries(PLUGIN_KIND_ICONS)) {
      expect(AVAILABLE_ICON_NAMES, `ikona "${icon}" za vrsto "${kind}" ni registrirana`).toContain(icon);
    }
  });

  it('ikone, ki jih Ionic uporabi sam v svojih komponentah, so registrirane', () => {
    // ion-menu-button riše "menu", ion-select "chevron-expand", app-page-header
    // (gumb nazaj) "chevron-back". Če katera manjka, komponenta pusti prazen prostor,
    // čeprav imena nikjer v naših predlogah ne omenjamo.
    for (const name of ['menu', 'chevron-expand', 'chevron-back']) {
      expect(AVAILABLE_ICON_NAMES).toContain(name);
    }
  });
});
