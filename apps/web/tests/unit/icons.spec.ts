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
  'bookmarks-outline', // saved-links — Shranjeni linki (008)
  'restaurant-outline', // recipes — Recepti (013)
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

// 008: ikone, ki jih zavihek "Shranjeni linki" uporablja v svojih predlogah. `link-outline` je
// bila registrirana že za vtičnike (005) — tu je nadomestek, kadar zapis nima niti izbrane
// ikone niti favicona (research.md §9).
const SAVED_LINKS_ICONS = [
  'link-outline', // nadomestek na koncu vrste prednosti
  'bookmarks-outline', // zavihek in ploščica
  'open-outline', // "odpri stran v novem zavihku"
  'refresh-outline', // "osveži podatke strani"
  'folder-outline', // mapa
  'reorder-three-outline', // ročica za prerazporejanje
  'add-outline',
  'create-outline',
  'trash-outline',
];

// 011: ikone razdelka za izbiro postaj in preklopnika na zavihku "Meritve postaj". Ta seznam
// je nastal iz PRAVE napake: razdelek je bil napisan s štirimi ikonami, ki jih ni nihče
// registriral, zato klik na postajo ni pokazal kljukice, gumba za odstranitev pa sploh ni bilo
// videti — razdelek je bil videti pokvarjen, čeprav je shranjevanje delovalo.
const METEO_ICONS = [
  'checkmark-circle', // izbrana postaja v seznamu
  'location-outline', // neizbrana postaja
  'star', // privzeta postaja (prva izbrana)
  'arrow-up-circle-outline', // "nastavi kot privzeto"
  'close-circle', // "odstrani postajo"
  'rainy-outline', // zavihek in gumb "Odpri meritve"
];

// 012: ikone izbirnika "delaj kot drug uporabnik" (meni) in opozorilnega pasu nad vsebino.
// Pas je edina stvar, ki adminu pove, da piše v tuje podatke — ikona, ki se ne izriše, mu
// vzame polovico tega opozorila.
const ACTING_USER_ICONS = [
  'people', // prevzeto ime (pas, aktiven izbirnik)
  'people-outline', // izbirnik v mirovanju
  'person-circle-outline', // "delaj v svojem imenu"
  'chevron-forward-outline', // odpiranje izbirnika
  'checkmark', // trenutna izbira v seznamu
];

// 013: ikone, ki jih zavihek "Recepti" uporablja v svojih predlogah. Del jih je registriranih že
// za druge zavihke (`time-outline`, `people-outline`, `image-outline`, `link-outline`,
// `refresh-outline`) — tu so naštete vse, ki jih predloge dejansko omenjajo, ker je ta test edina
// mreža pod imenom ikone, ki je v predlogi navaden niz.
const RECIPES_ICONS = [
  'restaurant-outline', // zavihek in nadomestek za recept brez slike
  'flame-outline', // "skuhano" in števec kuhanj
  'star', // polna zvezdica v oceni
  'star-outline', // prazna zvezdica v oceni
  'share-social-outline', // javna povezava
  'copy-outline', // kopiranje javne povezave
  'people-outline', // deljenje in število porcij
  'time-outline', // čas priprave
  'image-outline', // slike
  'link-outline', // izvorna stran
  'open-outline', // "odpri izvorno stran"
  'refresh-outline', // ponovni uvoz s strani
  'add-outline',
  'create-outline',
  'trash-outline',
  'close-outline',
  'search-outline',
  'arrow-back-outline', // izhod iz načina kuhanja
  'checkmark-circle-outline', // odkljukan korak v načinu kuhanja
  'square-outline', // neodkljukan korak v načinu kuhanja
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

  it('registrira vsako ikono, ki jo uporablja zavihek Shranjeni linki (008)', () => {
    for (const name of SAVED_LINKS_ICONS) {
      expect(AVAILABLE_ICON_NAMES, `ikona "${name}" iz zavihka Shranjeni linki ni registrirana`).toContain(
        name,
      );
    }
  });

  it('registrira vsako ikono, ki jo uporablja izbira postaj (011)', () => {
    for (const name of METEO_ICONS) {
      expect(AVAILABLE_ICON_NAMES, `ikona "${name}" iz razdelka Meritve postaj ni registrirana`).toContain(
        name,
      );
    }
  });

  it('registrira vsako ikono izbirnika uporabnika in opozorilnega pasu (012)', () => {
    for (const name of ACTING_USER_ICONS) {
      expect(AVAILABLE_ICON_NAMES, `ikona "${name}" iz izbirnika uporabnika ni registrirana`).toContain(
        name,
      );
    }
  });

  it('registrira vsako ikono, ki jo uporablja zavihek Recepti (013)', () => {
    for (const name of RECIPES_ICONS) {
      expect(AVAILABLE_ICON_NAMES, `ikona "${name}" iz zavihka Recepti ni registrirana`).toContain(
        name,
      );
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
