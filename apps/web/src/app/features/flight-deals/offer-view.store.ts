import { Injectable, inject } from '@angular/core';
import { CurrentUserService } from '../../core/user/current-user.service.js';
import { DEFAULT_OFFER_VIEW, offerViewStorageKey, parseOfferView, serializeOfferView, type OfferView, type OfferViewPage } from './flight-deals.model.js';

// Zapomnjen pogled tabele ponudb (obseg, iskanje, vrsta, direktni, pretečene, razvrščanje) — kar
// uporabnik pritisne, je njegov privzeti pogled ob naslednjem obisku. Shranjeno v `localStorage`
// te naprave, po uporabniku in strani (vzorec core/acting-user). Ni nastavitev strežnika: to je
// udobje enega brskalnika, ne podatek, ki bi ga moral videti drug odjemalec (člen III).
//
// Vsak dostop do shrambe je v try/catch: v zasebnem oknu ali z blokiranimi podatki strani
// `localStorage` vrže, stran pa mora delovati tudi brez spomina.

@Injectable({ providedIn: 'root' })
export class OfferViewStore {
  private readonly currentUser = inject(CurrentUserService);

  load(page: OfferViewPage): OfferView {
    try {
      return parseOfferView(window.localStorage.getItem(this.key(page)));
    } catch {
      return { ...DEFAULT_OFFER_VIEW };
    }
  }

  save(page: OfferViewPage, view: OfferView): void {
    try {
      window.localStorage.setItem(this.key(page), serializeOfferView(view));
    } catch {
      // Brez shrambe pogled živi samo v pomnilniku te strani.
    }
  }

  private key(page: OfferViewPage): string {
    return offerViewStorageKey(page, this.currentUser.user()?.id ?? null);
  }
}
