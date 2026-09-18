import { UsageCounterModel } from '../../../platform/usage/usage-counter.model.js';
import { TAB_REGISTRY } from '../../../platform/tabs/registry.js';
import { loadEnv } from '../../../platform/config/env.js';
import { buildCoverage, buildWindow, type UsageCoverage, type UsageWindow } from '../domain/usage-window.js';
import { rollupUsage, type CounterRow, type UsageRollup } from '../domain/usage-rollup.js';
import { readAllUsers } from './storage-usage.service.js';

// Pregled uporabe: prijave in ogledi zavihkov v izbranem obdobju.
//
// Ta storitev SME uvoziti `UsageCounterModel` in `TAB_REGISTRY`, ker sta oba v `platform/` — člen I
// prepoveduje uvoz med MODULI, skupna infrastruktura je prav za to. Razlika do
// `storage-usage.service.ts`, kjer se zbirke berejo po imenu, je torej v tem, čigave so: tam gre za
// zbirke tujih modulov, tu za skupno zmogljivost.
//
// Predpomnilnika tu NI: poizvedba je omejena z oknom in tečena nad indeksom `(day, kind)`, torej
// nekaj sto vrstic na obdobje. Pregled porabe je drago seštevanje čez vse zapise namestitve in ga
// predpomnilnik potrebuje; ta ne.

export interface UsageSnapshot extends UsageRollup {
  window: UsageWindow;
  coverage: UsageCoverage;
}

interface CounterDoc {
  userId: unknown;
  kind: 'login' | 'tab-view';
  key: string;
  count: number;
  lastAt: Date;
}

/** Najstarejši dan v zbirki — od kdaj meritve sploh obstajajo (FR-038). */
async function readDataSince(): Promise<string | null> {
  const oldest = await UsageCounterModel.findOne({}).sort({ day: 1 }).select('day').lean<{ day: string } | null>();
  return oldest?.day ?? null;
}

export async function getUsageSnapshot(days: number, now: Date = new Date()): Promise<UsageSnapshot> {
  const env = loadEnv();
  const window = buildWindow(days, now);

  const [docs, users, dataSince] = await Promise.all([
    UsageCounterModel.find({ day: { $gte: window.fromDay, $lte: window.toDay } })
      .select('userId kind key count lastAt')
      .lean<CounterDoc[]>(),
    readAllUsers(),
    readDataSince(),
  ]);

  const rows: CounterRow[] = docs.map((doc) => ({
    userId: String(doc.userId),
    kind: doc.kind,
    key: doc.key,
    count: doc.count,
    lastAt: doc.lastAt,
  }));

  // Register in ne `resolveTabs(...)`: lestvica je za CELO namestitev, zato mora vsebovati vse
  // zavihke, ne le tiste, ki jih ima vklopljene administrator, ki gleda zaslon.
  const tabs = TAB_REGISTRY.map((tab) => ({ id: tab.id, title: tab.title }));

  return {
    window,
    coverage: buildCoverage({ window, dataSince, retentionDays: env.USAGE_RETENTION_DAYS, now }),
    ...rollupUsage({ rows, users, tabs }),
  };
}
