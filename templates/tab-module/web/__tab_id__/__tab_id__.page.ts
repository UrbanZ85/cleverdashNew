import { Component } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/angular/standalone';

// PREDLOGA — preimenuj mapo in datoteko, zamenjaj `__tab_id__` z dejanskim imenom.
// Naslov v predlogi je slovenski (domenski podatek, člen X) — pusti ga tako.
// Uvažaj samo iz core/ ali shared/, nikoli neposredno iz drugega zavihka pod features/
// (člen I; lint pravilo v eslint.config.js to zavrne kot napako).
@Component({
  selector: 'app-__tab_id__-page',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Nov zavihek</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding"> Vsebina novega zavihka. </ion-content>
  `,
})
export class __TabId__Page {}
