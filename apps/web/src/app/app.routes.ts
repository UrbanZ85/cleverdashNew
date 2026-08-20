import type { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard.js';
import { tabGuard } from './core/tabs/tab-guard.js';

// Statične poti za ogrodje, US1 (prijava) in US2 (dashboard). Od US3 dalje (tasks.md T085)
// usmerjanje zavihkov nastane dinamično iz `TabRegistryService`, ki razreši register s
// strežnika — ta datoteka takrat obdrži samo poti, ki obstajajo neodvisno od zavihkov
// (prijava, dashboard kot začetni zaslon nad zavihki, 404).
export const APP_ROUTES: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.page.js').then((m) => m.LoginPage),
  },
  {
    path: 'change-password',
    loadComponent: () =>
      import('./features/auth/change-password.page.js').then((m) => m.ChangePasswordPage),
    canActivate: [authGuard],
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.page.js').then((m) => m.DashboardPage),
    canActivate: [authGuard, tabGuard],
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings.page.js').then((m) => m.SettingsPage),
    canActivate: [authGuard, tabGuard],
  },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: 'dashboard' },
];
