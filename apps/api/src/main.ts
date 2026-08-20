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
import { mustChangePasswordGuard } from './modules/auth/guards/must-change-password.guard.js';
import { ensureBootstrapUser } from './modules/auth/services/bootstrap-user.service.js';
import { dashboardRouter } from './modules/dashboard/router.js';
import { tabsRouter } from './platform/tabs/router.js';
import { settingsRouter } from './modules/settings/router.js';
import { notificationsRouter } from './platform/notifications/router.js';

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
  await ensureBootstrapUser(env, logger);

  // `cors()` se namenoma NE namesti — člen II. Enotni izvor uveljavlja Caddy (infra/Caddyfile).

  // Vrstni red je pomemben: najprej /health (brez avtentikacije), nato oba vratarja
  // (API ključ, dostopni JWT — vsak nastavi req.auth, če ustrezna glava obstaja), nato
  // idempotentnost, nato varovalka za obvezno menjavo gesla, šele nato zaščiteni moduli.
  apiV1Router.use(healthRouter);
  apiV1Router.use(apiKeyGuard());
  apiV1Router.use(accessTokenGuard(env));
  apiV1Router.use(idempotencyMiddleware());
  apiV1Router.use(mustChangePasswordGuard());
  apiV1Router.use(apiKeysRouter);
  apiV1Router.use(authRouter);
  apiV1Router.use(dashboardRouter);
  apiV1Router.use(tabsRouter);
  apiV1Router.use(settingsRouter);
  apiV1Router.use(notificationsRouter);

  app.use('/api/v1', apiV1Router);
  app.use(problemErrorHandler());

  startHeartbeat(env, logger);

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
