// Čista pretvorba med obrazcem za kraja ploščice "Pot" in obliko, ki gre na strežnik —
// brez uvozov iz @angular/*, da je preverljiva brez TestBed-a (isti vzorec kot
// core/settings/settings.model.ts in features/timesheet/timesheet.model.ts).
//
// ZAKAJ JE TO SVOJA DATOTEKA. Prva različica je to počela v zasebnih metodah komponente in
// je predpostavljala, da so vse vrednosti iz `ngModel` NIZI. Niso: `ion-input` z
// `type="number"` vrne ŠTEVILO, zato je `latitude.trim()` vrgel `TypeError` — sinhrono,
// znotraj `try` bloka v `save()`. Posledica je bila natanko taka, kot je bila videti:
// gumb je pokazal "Krajev ni bilo mogoče shraniti", zahteva na API pa ni šla nikoli ven, in
// v konzoli ni bilo ničesar, ker je `catch` napako požrl.
//
// Zato tip `FormFieldValue` odslej pove resnico o tem, kaj `ngModel` lahko vrne, pretvorba
// pa je funkcija, ki jo pokrivajo enotski testi (tests/unit/commute-form.spec.ts).

import { DEFAULT_MAP_HEIGHT_PX, type CommutePlaceSettings } from '../../core/settings/settings.model.js';

/** Kar `ngModel` na `ion-input` dejansko vrne: niz (besedilo), število (`type="number"`),
 * ali nič (prazno polje, pred prvim vnosom). */
export type FormFieldValue = string | number | null | undefined;

export interface CommutePlaceForm {
  label: FormFieldValue;
  address: FormFieldValue;
  latitude: FormFieldValue;
  longitude: FormFieldValue;
}

export function emptyPlaceForm(): CommutePlaceForm {
  return { label: '', address: '', latitude: '', longitude: '' };
}

/** Vrednost polja kot obrezan niz — ne glede na to, ali je `ngModel` vrnil niz ali število. */
export function asText(value: FormFieldValue): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Koordinata kot število, ali `null`, kadar polje ni izpolnjeno oziroma vrednost ni število.
 * Decimalna vejica je dovoljena: slovenska tipkovnica jo ponudi prva in `Number('45,96')`
 * je `NaN`, kar bi kraj tiho pustil brez koordinat.
 */
export function parseCoordinate(value: FormFieldValue): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = asText(value).replace(',', '.');
  if (text.length === 0) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Obrazec → popravek za `PUT /settings`.
 *
 * Prazno polje je pomenska vrednost ("ni nastavljeno"), ne "ne spreminjaj" — strežnik ga
 * tako tudi razume (commute-places.service.ts). Koordinati gresta VEDNO v paru: polovica
 * para je kraj, ki ga ni mogoče poslati ne Routes API-ju ne zemljevidu, in strežnik jo
 * zavrne s 400.
 */
export function toPlacePatch(form: CommutePlaceForm): CommutePlaceSettings {
  const latitude = parseCoordinate(form.latitude);
  const longitude = parseCoordinate(form.longitude);
  const bothPresent = latitude !== null && longitude !== null;
  return {
    label: asText(form.label),
    address: asText(form.address) || null,
    latitude: bothPresent ? latitude : null,
    longitude: bothPresent ? longitude : null,
  };
}

/**
 * Višina zemljevida iz obrazca. Prazno polje pomeni privzeto vrednost (`DEFAULT_MAP_HEIGHT_PX`);
 * vrednost izven mej se NE obreže tiho — pošlje se, kot je, in strežnik jo zavrne s
 * pojasnilom, sicer bi uporabnik vpisal 2000 in dobil 600 brez besede.
 */
export function parseMapHeight(value: FormFieldValue): number {
  const parsed = parseCoordinate(value);
  return parsed === null ? DEFAULT_MAP_HEIGHT_PX : Math.round(parsed);
}

/** Shranjen kraj → obrazec. Prazno polje in ne "null", da v polju ne piše beseda "null". */
export function toPlaceForm(place: CommutePlaceSettings): CommutePlaceForm {
  return {
    label: place.label ?? '',
    address: place.address ?? '',
    latitude: place.latitude === null ? '' : place.latitude,
    longitude: place.longitude === null ? '' : place.longitude,
  };
}
