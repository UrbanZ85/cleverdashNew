import { Router } from 'express';
import { isMongoHealthy } from '../db/mongoose.js';
import { getHeartbeatStatus } from './heartbeat.js';
import { peekCacheAge } from '../cache/service.js';
import { loadEnv } from '../config/env.js';
import { getHealthExtension } from './extension.js';

// Člen VII: notranji /health NE zadošča kot alarm — mrtev proces ga ne pokliče. Zunanji
// dead man's switch (heartbeat.ts) je resnični alarm; ta endpoint je diagnostika za
// človeka in za US2 (starost predpomnjenih virov, T073).
export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  const database = isMongoHealthy() ? 'ok' : 'failing';
  const heartbeat = getHeartbeatStatus();
  const status = database === 'ok' ? 'ok' : 'failing';

  const env = loadEnv();
  const location = env.ARSO_DEFAULT_LOCATION;
  const [radar, weather] = await Promise.all([
    peekCacheAge('radar:si0-rm-anim'),
    peekCacheAge(`weather:${location}`),
  ]);
  const externalSources = [
    radar ? { key: 'radar', ageSeconds: radar.ageSeconds, stale: radar.stale } : null,
    weather ? { key: 'weather', ageSeconds: weather.ageSeconds, stale: weather.stale } : null,
  ].filter((v): v is { key: string; ageSeconds: number; stale: boolean } => v !== null);

  // 002, HealthExtension: schedulerLastTickAgeSeconds/browser/remoteSessions/failed-
  // /missedActionsLast24h. Modul se prijavi prek registerHealthExtension (T034); brez
  // prijave (npr. v testih 001) vrne dokumentirane privzetke, ne manjkajoča polja.
  const extension = await getHealthExtension();

  res.status(status === 'ok' ? 200 : 503).json({
    status,
    timeZone: 'Europe/Ljubljana',
    checks: {
      database,
      configuration: 'ok',
      externalSources,
      heartbeat,
    },
    schedulerLastTickAgeSeconds: extension.schedulerLastTickAgeSeconds,
    browser: extension.browser,
    remoteSessions: extension.remoteSessions,
    failedActionsLast24h: extension.failedActionsLast24h,
    missedActionsLast24h: extension.missedActionsLast24h,
  });
});
