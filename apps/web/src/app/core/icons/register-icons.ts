import { addIcons } from 'ionicons';
import {
  addOutline,
  alertCircleOutline,
  appsOutline,
  arrowBackOutline,
  arrowDownOutline,
  arrowUpOutline,
  browsersOutline,
  businessOutline,
  calendarOutline,
  carOutline,
  checkboxOutline,
  checkmarkCircleOutline,
  checkmarkDoneOutline,
  chevronBack,
  chevronDownOutline,
  chevronExpand,
  chevronForwardOutline,
  closeOutline,
  cloudOfflineOutline,
  cloudUploadOutline,
  codeSlashOutline,
  createOutline,
  documentTextOutline,
  ellipsisVertical,
  expandOutline,
  helpCircleOutline,
  homeOutline,
  imageOutline,
  linkOutline,
  listOutline,
  lockClosedOutline,
  locationOutline,
  logOutOutline,
  micOutline,
  menu,
  menuOutline,
  openOutline,
  partlySunnyOutline,
  pauseOutline,
  peopleOutline,
  personCircleOutline,
  pinOutline,
  playOutline,
  radioOutline,
  readerOutline,
  refreshOutline,
  reorderThreeOutline,
  reorderTwoOutline,
  rainyOutline,
  saveOutline,
  searchOutline,
  serverOutline,
  sparklesOutline,
  squareOutline,
  stopCircleOutline,
  settingsOutline,
  thermometerOutline,
  timeOutline,
  trashOutline,
  videocamOutline,
  warningOutline,
  waterOutline,
} from 'ionicons/icons';

// Z `@ionic/angular/standalone` se ikone NE naložijo same — brez `addIcons()` je vsak
// `<ion-icon name="...">` prazen kvadrat. To je bila dejanska napaka: register zavihkov
// (platform/tabs/registry.ts) je pošiljal imena ikon, ki jih ni nihče registriral, zato je
// bil meni sam brez ikon.
//
// Register je NAMENOMA eksplicitna preslikava, ne `import * as allIcons` — slednje vgradi
// ~1300 SVG nizov v paket, kar je za Capacitor build na telefonu nepotrebna teža.
//
// Trije razredi ikon so tu:
//  1. imena, ki jih uporabljajo naše predloge (`name="trash-outline"`);
//  2. imena, ki prihajajo s STREŽNIKA (TAB_REGISTRY.icon) — teh prevajalnik ne vidi, zato
//     jih varuje `tests/unit/icons.spec.ts`, ki preveri, da je vsako ime iz registra tukaj;
//  3. imena, ki jih Ionic uporabi SAM v svojih komponentah (`menu` za `ion-menu-button`,
//     `chevron-expand` za `ion-select`, `chevron-back` za `ion-back-button`) — brez njih
//     komponenta izriše prazen prostor, čeprav je v naši kodi ne omenjamo.
export const REGISTERED_ICONS = {
  'add-outline': addOutline,
  'alert-circle-outline': alertCircleOutline,
  'apps-outline': appsOutline,
  'arrow-back-outline': arrowBackOutline,
  'arrow-down-outline': arrowDownOutline,
  'arrow-up-outline': arrowUpOutline,
  'browsers-outline': browsersOutline,
  'business-outline': businessOutline,
  'calendar-outline': calendarOutline,
  'car-outline': carOutline,
  'checkbox-outline': checkboxOutline,
  'checkmark-circle-outline': checkmarkCircleOutline,
  'checkmark-done-outline': checkmarkDoneOutline,
  'chevron-back': chevronBack,
  'chevron-down-outline': chevronDownOutline,
  'chevron-expand': chevronExpand,
  'chevron-forward-outline': chevronForwardOutline,
  'close-outline': closeOutline,
  'cloud-offline-outline': cloudOfflineOutline,
  'cloud-upload-outline': cloudUploadOutline,
  'code-slash-outline': codeSlashOutline,
  'create-outline': createOutline,
  'document-text-outline': documentTextOutline,
  'ellipsis-vertical': ellipsisVertical,
  'expand-outline': expandOutline,
  'help-circle-outline': helpCircleOutline,
  'home-outline': homeOutline,
  'image-outline': imageOutline,
  'link-outline': linkOutline,
  'list-outline': listOutline,
  'lock-closed-outline': lockClosedOutline,
  'location-outline': locationOutline,
  'log-out-outline': logOutOutline,
  menu: menu,
  'mic-outline': micOutline,
  'menu-outline': menuOutline,
  'open-outline': openOutline,
  'partly-sunny-outline': partlySunnyOutline,
  'pause-outline': pauseOutline,
  'people-outline': peopleOutline,
  'person-circle-outline': personCircleOutline,
  'pin-outline': pinOutline,
  'play-outline': playOutline,
  'radio-outline': radioOutline,
  'rainy-outline': rainyOutline,
  'reader-outline': readerOutline,
  'refresh-outline': refreshOutline,
  'reorder-three-outline': reorderThreeOutline,
  'reorder-two-outline': reorderTwoOutline,
  'save-outline': saveOutline,
  'search-outline': searchOutline,
  'server-outline': serverOutline,
  'settings-outline': settingsOutline,
  'sparkles-outline': sparklesOutline,
  'square-outline': squareOutline,
  'stop-circle-outline': stopCircleOutline,
  'thermometer-outline': thermometerOutline,
  'time-outline': timeOutline,
  'trash-outline': trashOutline,
  'videocam-outline': videocamOutline,
  'warning-outline': warningOutline,
  'water-outline': waterOutline,
} as const;

/** Imena ikon, ki jih sme uporabiti vnos v strežniškem registru zavihkov ali definicija
 * vtičnika. Uporabnik si ikono vtičnika izbere iz tega nabora (ne vpiše poljubnega niza),
 * sicer bi lahko shranil ime, ki se izriše kot prazen prostor. */
export const AVAILABLE_ICON_NAMES = Object.keys(REGISTERED_ICONS) as ReadonlyArray<
  keyof typeof REGISTERED_ICONS
>;

/** Kliče se enkrat ob zagonu, iz `main.ts` — pred izrisom prve komponente. */
export function registerIcons(): void {
  addIcons(REGISTERED_ICONS);
}
