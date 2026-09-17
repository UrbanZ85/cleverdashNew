import { addIcons } from 'ionicons';
import {
  addOutline,
  alertCircleOutline,
  appsOutline,
  arrowBackOutline,
  arrowDownOutline,
  arrowUpCircleOutline,
  arrowUpOutline,
  bookmarksOutline,
  browsersOutline,
  businessOutline,
  calendarOutline,
  carOutline,
  checkboxOutline,
  checkmark,
  checkmarkCircleOutline,
  checkmarkCircle,
  checkmarkDoneOutline,
  chevronBack,
  chevronDownOutline,
  chevronExpand,
  chevronForwardOutline,
  closeCircle,
  closeOutline,
  copyOutline,
  cloudOfflineOutline,
  cloudUploadOutline,
  codeSlashOutline,
  createOutline,
  documentTextOutline,
  ellipsisHorizontalOutline,
  ellipsisVertical,
  expandOutline,
  flameOutline,
  folderOutline,
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
  people,
  peopleOutline,
  personCircleOutline,
  pinOutline,
  playOutline,
  radioOutline,
  readerOutline,
  refreshOutline,
  restaurantOutline,
  reorderThreeOutline,
  reorderTwoOutline,
  rainyOutline,
  saveOutline,
  searchOutline,
  serverOutline,
  shareSocialOutline,
  sparklesOutline,
  squareOutline,
  star,
  starOutline,
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
  'arrow-up-circle-outline': arrowUpCircleOutline,
  'arrow-up-outline': arrowUpOutline,
  'bookmarks-outline': bookmarksOutline,
  'browsers-outline': browsersOutline,
  'business-outline': businessOutline,
  'calendar-outline': calendarOutline,
  'car-outline': carOutline,
  'checkbox-outline': checkboxOutline,
  checkmark,
  'checkmark-circle': checkmarkCircle,
  'checkmark-circle-outline': checkmarkCircleOutline,
  'checkmark-done-outline': checkmarkDoneOutline,
  'chevron-back': chevronBack,
  'chevron-down-outline': chevronDownOutline,
  'chevron-expand': chevronExpand,
  'chevron-forward-outline': chevronForwardOutline,
  'close-circle': closeCircle,
  'close-outline': closeOutline,
  // 013: kopiranje javne povezave recepta v odložišče.
  'copy-outline': copyOutline,
  'cloud-offline-outline': cloudOfflineOutline,
  'cloud-upload-outline': cloudUploadOutline,
  'code-slash-outline': codeSlashOutline,
  'create-outline': createOutline,
  'document-text-outline': documentTextOutline,
  'ellipsis-horizontal-outline': ellipsisHorizontalOutline,
  'ellipsis-vertical': ellipsisVertical,
  'expand-outline': expandOutline,
  // 013: oznaka 'skuhano' in števec kuhanj.
  'flame-outline': flameOutline,
  'folder-outline': folderOutline,
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
  // 012: polna različica označuje prevzeto ime (opozorilni pas, izbirnik v meniju).
  people,
  'people-outline': peopleOutline,
  'person-circle-outline': personCircleOutline,
  'pin-outline': pinOutline,
  'play-outline': playOutline,
  'radio-outline': radioOutline,
  'rainy-outline': rainyOutline,
  'reader-outline': readerOutline,
  'refresh-outline': refreshOutline,
  // 013: ikona zavihka 'Recepti' — prihaja s STREŽNIKA (platform/tabs/registry.ts), zato jo
  // prevajalnik ne vidi in jo varuje tests/unit/icons.spec.ts.
  'restaurant-outline': restaurantOutline,
  'reorder-three-outline': reorderThreeOutline,
  'reorder-two-outline': reorderTwoOutline,
  'save-outline': saveOutline,
  'search-outline': searchOutline,
  'server-outline': serverOutline,
  // 013: izdaja javne povezave do recepta.
  'share-social-outline': shareSocialOutline,
  'settings-outline': settingsOutline,
  'sparkles-outline': sparklesOutline,
  'square-outline': squareOutline,
  star: star,
  // 013: prazna zvezdica v ocenjevalniku — polna je zgoraj.
  'star-outline': starOutline,
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
