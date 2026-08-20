import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { AppComponent } from './app/app.component.js';
import { APP_ROUTES } from './app/app.routes.js';
import { authInterceptor } from './app/core/auth/auth.interceptor.js';

// Ionic 8 + Angular 20, standalone komponente, brez NgModule (plan.md, Technical Context) —
// stari projekt je uporabljal Angular 17 z moduli, nov naj tega pristopa ne podeduje.
bootstrapApplication(AppComponent, {
  providers: [
    provideIonicAngular({}),
    provideRouter(APP_ROUTES),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
}).catch((err) => {
  console.error('Zagon aplikacije je spodletel:', err);
});
