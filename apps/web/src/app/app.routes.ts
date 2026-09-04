import type { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard.js';
import { tabGuard } from './core/tabs/tab-guard.js';

// Statične poti za ogrodje in dashboard. Od US3 dalje (tasks.md T085) usmerjanje zavihkov
// nastane dinamično iz `TabRegistryService`, ki razreši register s strežnika — ta datoteka
// obdrži samo poti, ki obstajajo neodvisno od zavihkov (dashboard kot začetni zaslon nad
// zavihki, 404). 004: `/login` in `/change-password` sta odstranjeni (FR-017) — prijava je
// preusmeritev na `/api/v1/auth/login` (glej auth.service.ts, auth.guard.ts), ne Angular pot.
export const APP_ROUTES: Routes = [
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
  {
    path: 'time-tracking',
    loadComponent: () => import('./features/time-tracking/today/today.page.js').then((m) => m.TodayPage),
    canActivate: [authGuard, tabGuard],
  },
  // Podstrani modula "Beleženje časa" (Urnik/Koledar/Zgodovina/Diagnostika) so dosegljive
  // samo prek navigacije iz zaslona "Danes", ki je sam tab-gated — tabGuard preverja
  // TOČNO ujemanje poti z registrom (tab-registry.service.ts), zato podstrani namenoma
  // niso posebej navedene tam, enako kot "/dashboard" ni bil, preden je postal zavihek.
  {
    path: 'time-tracking/schedule',
    loadComponent: () => import('./features/time-tracking/schedule/schedule.page.js').then((m) => m.SchedulePage),
    canActivate: [authGuard],
  },
  {
    path: 'time-tracking/calendar',
    loadComponent: () => import('./features/time-tracking/calendar/calendar.page.js').then((m) => m.CalendarPage),
    canActivate: [authGuard],
  },
  {
    path: 'time-tracking/diagnostics',
    loadComponent: () => import('./features/time-tracking/diagnostics/diagnostics.page.js').then((m) => m.DiagnosticsPage),
    canActivate: [authGuard],
  },
  {
    path: 'time-tracking/history',
    loadComponent: () => import('./features/time-tracking/history/history.page.js').then((m) => m.HistoryPage),
    canActivate: [authGuard],
  },
  {
    path: 'notes',
    loadComponent: () => import('./features/notes/notes.page.js').then((m) => m.NotesPage),
    canActivate: [authGuard, tabGuard],
  },
  {
    path: 'todos',
    loadComponent: () => import('./features/todos/todos.page.js').then((m) => m.TodosPage),
    canActivate: [authGuard, tabGuard],
  },
  // Urejevalnik je podstran zavihka `notes` — dosegljiv samo prek seznama, ki je sam
  // tab-gated (tabGuard preverja TOČNO ujemanje poti z registrom), enako kot podstrani
  // "cameras" in "time-tracking" spodaj.
  //
  // `notes/new` NIMA svojega vnosa, ampak se ujame kot `:noteId = 'new'` (urejevalnik to
  // vrednost razume kot "nova beležka"). To ni varčevanje z vrsticami: ob prvem shranjevanju
  // se naslov zamenja na `notes/<id>`, in če bi bila to DRUGA definicija poti, bi Angular
  // urejevalnik zavrgel in ustvaril novega. Posnetek, ki se je ravno nalagal, bi se takrat
  // shranil v beležko, ki je novi primerek še ne prikazuje — uporabnik bi govoril in ne bi
  // videl posnetka. Z isto definicijo se spremeni samo parameter in primerek ostane.
  {
    path: 'notes/:noteId',
    loadComponent: () => import('./features/notes/note-editor.page.js').then((m) => m.NoteEditorPage),
    canActivate: [authGuard],
  },
  {
    path: 'timesheet',
    loadComponent: () => import('./features/timesheet/timesheet.page.js').then((m) => m.TimesheetPage),
    canActivate: [authGuard, tabGuard],
  },
  {
    path: 'cameras',
    loadComponent: () => import('./features/cameras/grid/camera-grid.page.js').then((m) => m.CameraGridPage),
    canActivate: [authGuard, tabGuard],
  },
  // Podstrani zavihka "cameras" (urejanje, celozaslonski prikaz) so dosegljive samo prek
  // navigacije iz mreže/zaslona za urejanje — enak vzorec kot podstrani "time-tracking"
  // zgoraj. 'cameras/manage' MORA biti navedena pred 'cameras/:id', sicer bi usmerjevalnik
  // "manage" razumel kot ID kamere.
  {
    path: 'cameras/manage',
    loadComponent: () => import('./features/cameras/manage/camera-manage.page.js').then((m) => m.CameraManagePage),
    canActivate: [authGuard],
  },
  {
    path: 'cameras/:cameraId',
    loadComponent: () => import('./features/cameras/viewer/camera-viewer.page.js').then((m) => m.CameraViewerPage),
    canActivate: [authGuard],
  },
  {
    path: 'file-sharing',
    loadComponent: () => import('./features/file-sharing/file-sharing.page.js').then((m) => m.FileSharingPage),
    canActivate: [authGuard, tabGuard],
  },
  // 009: PRVA pot v tej aplikaciji BREZ `authGuard`. Stran za prevzem datoteke odpre človek,
  // ki nima računa in ga ne bo dobil (FR-020) — `authGuard` bi ga preusmeril na Keycloak,
  // `tabGuard` pa preverja točno ujemanje z registrom zavihkov, kjer te poti NI in ne sme biti
  // (FR-073).
  //
  // Pot je kratka namenoma: povezava gre tujim ljudem in v tuje pogovore, kjer se dolg naslov
  // lomi (research.md §6). Stati mora PRED `**`, sicer bi jo prestregla preusmeritev na
  // nadzorno ploščo — in prejemnik brez računa bi pristal na prijavi.
  {
    path: 'd/:token',
    loadComponent: () =>
      import('./features/file-sharing/download/file-download.page.js').then((m) => m.FileDownloadPage),
  },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: 'dashboard' },
];
