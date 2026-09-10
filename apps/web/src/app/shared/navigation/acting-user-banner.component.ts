import { Component, OnInit, inject } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { ActingUserService } from '../../core/acting-user/acting-user.service.js';
import { CurrentUserService } from '../../core/user/current-user.service.js';

// 012 — pas nad vsebino, kadar admin dela v imenu drugega uporabnika.
//
// Zakaj VEDNO viden in ne le v meniju: na ozkem zaslonu je meni zaprt, in vsak zaslon
// aplikacije potem izgleda popolnoma normalno — kot lasten. Vsak vnos, vsaka izbrisana beležka
// in vsaka zabeležena ura pa gre tujemu človeku. Pas je edina stvar, ki loči "gledam svoje
// podatke" od "pišem v tuje", zato je nezaprtljiv in nosi izhod iz stanja.
//
// Barva je opozorilna (`warning`) in ne informativna: to ni obvestilo, ampak stanje, iz
// katerega je treba priti ven.

@Component({
  selector: 'app-acting-user-banner',
  standalone: true,
  imports: [IonIcon],
  template: `
    @if (currentUser.actingAs(); as target) {
      <div class="bar" role="status">
        <ion-icon name="people" aria-hidden="true"></ion-icon>
        <span class="text">
          Delaš kot <strong>{{ target.displayName }}</strong> — vse spremembe se shranijo njemu.
        </span>
        <button type="button" class="exit" (click)="back()">Nazaj na svoj račun</button>
      </div>
    }
  `,
  styles: `
    .bar {
      display: flex;
      align-items: center;
      gap: var(--cd-space-2);
      flex: none;
      padding: var(--cd-space-2) var(--cd-space-3);
      /* Zarezo na vrhu prispeva ta pas, ker stoji nad glavo strani. */
      padding-top: calc(var(--cd-space-2) + env(safe-area-inset-top));
      background: var(--ion-color-warning);
      color: var(--ion-color-warning-contrast);
      font-size: var(--cd-font-size-sm);
    }
    .bar ion-icon {
      flex: none;
      font-size: 1.1rem;
    }
    .text {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .exit {
      flex: none;
      margin: 0;
      padding: var(--cd-space-1) var(--cd-space-3);
      border: 1px solid currentColor;
      border-radius: var(--cd-radius-sm);
      background: transparent;
      color: inherit;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .exit:hover {
      background: rgba(0, 0, 0, 0.12);
    }
  `,
})
export class ActingUserBannerComponent implements OnInit {
  protected readonly currentUser = inject(CurrentUserService);
  private readonly actingUser = inject(ActingUserService);

  // Pas se izriše zunaj menija in ne sme biti odvisen od tega, ali je meni že poklical
  // `ensureLoaded()`. Klic je deljen in se zgodi enkrat na sejo (CurrentUserService).
  ngOnInit(): void {
    void this.currentUser.ensureLoaded();
  }

  back(): void {
    this.actingUser.select(null);
  }
}
