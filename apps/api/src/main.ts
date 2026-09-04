import express from 'express';
import cookieParser from 'cookie-parser';
import { loadEnv } from './platform/config/env.js';
import { createLogger } from './platform/logging/logger.js';
import { correlationMiddleware } from './platform/logging/correlation.js';
import { problemErrorHandler } from './platform/errors/problem.js';
import { apiV1Router } from './platform/http/router.js';
import { connectMongo } from './platform/db/mongoose.js';
import { healthRouter } from './platform/health/router.js';
import { startHeartbeat } from './platform/health/heartbeat.js';
import { idempotencyMiddleware } from './platform/idempotency/middleware.js';
import { apiKeyGuard } from './platform/apikeys/guard.js';
import { apiKeysRouter } from './platform/apikeys/router.js';
import { accessTokenGuard } from './modules/auth/services/access-token.service.js';
import { authRouter } from './modules/auth/router.js';
import { dashboardRouter } from './modules/dashboard/router.js';
import { dashboardPluginsRouter } from './modules/dashboard/plugins.router.js';
import { tabsRouter } from './platform/tabs/router.js';
import { settingsRouter } from './modules/settings/router.js';
import { notificationsRouter } from './platform/notifications/router.js';
import { timeTrackingRouter } from './modules/time-tracking/router.js';
import { startScheduler } from './modules/time-tracking/scheduler.js';
import { registerSchedulerSteps } from './modules/time-tracking/scheduler-steps.js';
import { registerTimeTrackingTabDetail } from './modules/time-tracking/tab-detail.js';
import { camerasRouter, cameraGroupsRouter } from './modules/cameras/router.js';
import { timesheetRouter } from './modules/timesheet/router.js';
import { notesRouter } from './modules/notes/router.js';
import { fileSharingRouter } from './modules/file-sharing/router.js';
import { fileSharingPublicRouter } from './modules/file-sharing/public.router.js';
import { ensureDirs as ensureFileShareDirs } from './modules/file-sharing/services/blob-storage.service.js';
import { startFileShareCleanup } from './modules/file-sharing/services/cleanup.service.js';
import { todosRouter } from './modules/todos/router.js';
import { usersRouter } from './platform/users/router.js';
import { registerTodosTabDetail } from './modules/todos/tab-detail.js';

// Ta datoteka je edino mesto, ki poveže module z `/api/v1`. Dodajanje modula (dashboard,
// settings, tabs — 004+ v tej funkcionalnosti) pomeni en nov `apiV1Router.use(...)` klic
// tukaj in nič drugje — člen I dovoljuje ravno to, ker gre za register, ne za medsebojni
// uvoz modulov.

export async function createApp() {
  const env = loadEnv();
  const logger = createLogger(env);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // za pravi req.ip za Caddyjem (FR-015)
  app.use(express.json());
  app.use(cookieParser());
  app.use(correlationMiddleware(logger));

  await connectMongo(env, logger);

  // `cors()` se namenoma NE namesti — člen II. Enotni izvor uveljavlja skupni Caddy (infra/cleverdash.caddyfile).

  // Vrstni red je pomemben: najprej /health (brez avtentikacije), nato oba vratarja
  // (API ključ, dostopni žeton — Keycloakov relay, preverjen v živo pri Keycloaku, glej
  // access-token.service.ts — vsak nastavi req.auth, če ustrezna glava obstaja), nato
  // idempotentnost, šele nato zaščiteni moduli. 004: varovalka za obvezno menjavo gesla je
  // odpravljena — lokalnega gesla ni več (FR-017).
  apiV1Router.use(healthRouter);
  apiV1Router.use(apiKeyGuard());
  apiV1Router.use(accessTokenGuard(env));
  apiV1Router.use(idempotencyMiddleware());
  apiV1Router.use(apiKeysRouter);
  apiV1Router.use(authRouter);
  apiV1Router.use(dashboardRouter);
  apiV1Router.use(dashboardPluginsRouter);
  apiV1Router.use(tabsRouter);
  apiV1Router.use(settingsRouter);
  apiV1Router.use(notificationsRouter);
  apiV1Router.use(timeTrackingRouter);
  apiV1Router.use(camerasRouter);
  apiV1Router.use(cameraGroupsRouter);
  apiV1Router.use(timesheetRouter);
  apiV1Router.use(notesRouter);
  apiV1Router.use(fileSharingRouter);
  // 009: JAVNE poti `/share/*` — edine v tem zaledju brez `requireScopes`. Vpete so kot vsak
  // drug modul, ne pred vratarji: `apiKeyGuard` in `accessTokenGuard` zahteve BREZ poverilnic
  // ne zavrneta (samo nastavita `req.auth`, če glava obstaja), zavrne šele `requireScopes`.
  // Javna pot je torej pot, ki ga NE pokliče (research.md §2) — s tem pa še vedno teče skozi
  // korelacijo, idempotentnost in obravnavo napak, kar bi `app.use` pred vratarji preskočil.
  apiV1Router.use(fileSharingPublicRouter);
  apiV1Router.use(todosRouter);
  // 010: imenik uporabnikov je SKUPNA zmogljivost, ne del modula opravil — izbira osebe ni
  // pojem opravil in mora preživeti odstranitev katerega koli modula (člen I). Zato živi v
  // platform/users/, tako kot `/tabs` in `/devices`.
  apiV1Router.use(usersRouter);

  app.use('/api/v1', apiV1Router);
  app.use(problemErrorHandler());

  // 005: modul beleženja časa prispeva podnaslov in stanje vira svojemu zavihku v meniju
  // (platform/tabs/extension.ts). Prijava je NEODVISNA od schedulerja: meni mora povedati,
  // katera lokacija se beleži, tudi kadar je samodejno izvajanje izklopljeno.
  registerTimeTrackingTabDetail();
  registerTodosTabDetail();

  // 009: hramba deljenih datotek je na disku (nosilec `shared-files`), ne v bazi. Imenika
  // `tmp/` in `blobs/` morata obstajati, preden pride prvo nalaganje. Pometač teče takoj ob
  // zagonu (dohitevanje zaostanka po izpadu, člen V.2) in nato periodično — LASTEN, ne klic v
  // scheduler modula 002 (člen I).
  await ensureFileShareDirs();
  // V testih ne: vsak `createApp()` bi zagnal svoj časovnik nad v-pomnilniško bazo, ki jo test
  // med tem pobriše. Pometač se tam kliče neposredno (`runFileShareCleanup`), kar je tudi
  // edini način, da se ga da preveriti brez čakanja na uro.
  if (env.NODE_ENV !== 'test') startFileShareCleanup(logger);

  // 002, research.md §8 "Integracijska podrobnost": scheduler tika prevzame odhodni ping
  // (vsakih SCHEDULER_TICK_SECONDS namesto ločenega 60-sekundnega intervala). `startHeartbeat`
  // teče samo, če je scheduler izklopljen — javno vedenje modula heartbeat.ts se ne spremeni.
  if (env.SCHEDULER_ENABLED) {
    registerSchedulerSteps();
    startScheduler(env, logger);
  } else {
    startHeartbeat(env, logger);
  }

  return { app, env, logger };
}

async function bootstrap() {
  const { app, env, logger } = await createApp();
  app.listen(env.PORT, () => {
    logger.info({ event: 'server.listening', port: env.PORT }, `CleverDash API na vratih ${env.PORT}`);
  });
}

// Ne zaganjaj strežnika med testi, ki uvažajo createApp() neposredno.
if (process.env.VITEST !== 'true') {
  bootstrap().catch((err) => {
    console.error('Zagon je spodletel:', err);
    process.exit(1);
  });
}
