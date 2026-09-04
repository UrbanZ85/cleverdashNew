import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { AppComponent } from './app/app.component.js';
import { APP_ROUTES } from './app/app.routes.js';
import { authInterceptor } from './app/core/auth/auth.interceptor.js';
import { registerIcons } from './app/core/icons/register-icons.js';

// Ionic 8 + Angular 20, standalone komponente, brez NgModule (plan.md, Technical Context) —
// stari projekt je uporabljal Angular 17 z moduli, nov naj tega pristopa ne podeduje.
//
// Opomba o animacijah: `provideAnimations()` tu NI in ni potreben. Ionic 8 svoje prehode
// (drsenje menija, prehodi med stranmi) izvaja v Stencilu, ne prek `@angular/animations` —
// paket zato sploh ni med odvisnostmi. Dodati ga samo zaradi tega klica bi bila teža brez
// učinka.

// PRED zagonom: brez tega je vsak `<ion-icon>` prazen (glej core/icons/register-icons.ts).
registerIcons();

bootstrapApplication(AppComponent, {
  providers: [
    provideIonicAngular({}),
    provideRouter(APP_ROUTES),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
}).catch((err) => {
  console.error('Zagon aplikacije je spodletel:', err);
});
