import type { DirectoryUser } from './storage-rollup.js';

// Zlaganje dnevnih števcev v lestvice (člen IX: brez baze, brez strežnika).
//
// Ista dva previda kot pri porabi (research.md §9), obrnjena na uporabo:
//
//  - OSEBA brez prijav mora biti v seznamu z ničlo. "Kdo se pol leta ni prijavil" je predpogoj za
//    vsako odločitev o računih in je natanko to, kar prazna vrstica pove.
//  - ZAVIHEK brez ogledov mora biti na lestvici z ničlo. Neuporabljen zavihek je ravno tisti
//    podatek, zaradi katerega lestvica obstaja — če manjka, je vprašanje "ali se ta modul splača
//    vzdrževati" brez odgovora.

/** Ena vrstica števca, kakor pride iz zbirke. */
export interface CounterRow {
  userId: string;
  kind: 'login' | 'tab-view';
  key: string;
  count: number;
  lastAt: Date;
}

/** Oseba z zadnjo prijavo iz zapisa o uporabniku — obstaja od 004 in pokriva čas pred uvedbo. */
export interface UserWithLastLogin extends DirectoryUser {
  lastLoginAt: Date | null;
}

export interface TabDescriptor {
  id: string;
  title: string;
}

export interface UsageUserRow {
  userId: string;
  displayName: string;
  maskedEmail: string | null;
  logins: number;
  lastLoginAt: Date | null;
  /** Zadnji dogodek katere koli vrste v obdobju; `null`, če ga ni bilo. */
  lastActiveAt: Date | null;
  /** Oznaka zavihka → število ogledov v obdobju. */
  tabs: Record<string, number>;
}

export interface UsageTabRow {
  tabId: string;
  title: string;
  views: number;
  /** Koliko RAZLIČNIH oseb je zavihek v obdobju odprlo. */
  users: number;
}

export interface UsageRollup {
  logins: { total: number; activeUsers: number; inactiveUsers: number };
  byUser: UsageUserRow[];
  tabs: UsageTabRow[];
}

function laterOf(a: Date | null, b: Date): Date {
  return a === null || b > a ? b : a;
}

export function rollupUsage(params: {
  rows: readonly CounterRow[];
  users: readonly UserWithLastLogin[];
  tabs: readonly TabDescriptor[];
}): UsageRollup {
  const { rows, users, tabs } = params;

  // Vrstice nastanejo iz SEZNAMA OSEB, ne iz najdenih števcev.
  const byUser = new Map<string, UsageUserRow>(
    users.map((user) => [
      user.id,
      {
        userId: user.id,
        displayName: user.displayName,
        maskedEmail: user.maskedEmail,
        logins: 0,
        lastLoginAt: user.lastLoginAt,
        lastActiveAt: null,
        tabs: Object.fromEntries(tabs.map((tab) => [tab.id, 0])),
      },
    ]),
  );

  const tabViews = new Map<string, { views: number; users: Set<string> }>(
    tabs.map((tab) => [tab.id, { views: 0, users: new Set<string>() }]),
  );

  let totalLogins = 0;

  for (const row of rows) {
    const user = byUser.get(row.userId);
    // Števec osebe, ki je v zbirki uporabnikov ni. V praksi se ne zgodi (zapis o uporabniku se ne
    // briše), a tiho seštevanje v skupno vsoto brez vrstice, ki bi ga pojasnila, bi bilo natanko
    // to, čemur se pri porabi izogibamo z vrstico "neznan lastnik". Tu je vrstic manj in številka
    // ne bi imela kam — zato se preskoči, in razlika je vidna kot manjkajoča oseba, ne kot
    // nepojasnjen seštevek.
    if (!user) continue;

    if (row.kind === 'login') {
      user.logins += row.count;
      totalLogins += row.count;
    } else {
      // Zavihek, ki ga register ne pozna več (odstranjen modul): njegovi stari števci ostanejo v
      // zbirki do roka hrambe, na lestvici pa nimajo vrstice. Preskočimo jih namesto da bi jim
      // izmislili naslov — lestvica zavihkov, ki jih ni, ni odgovor na nobeno vprašanje.
      const tab = tabViews.get(row.key);
      if (!tab) continue;
      tab.views += row.count;
      tab.users.add(row.userId);
      user.tabs[row.key] = (user.tabs[row.key] ?? 0) + row.count;
    }

    user.lastActiveAt = laterOf(user.lastActiveAt, row.lastAt);
  }

  const userRows = [...byUser.values()].sort(
    (a, b) => b.logins - a.logins || a.displayName.localeCompare(b.displayName, 'sl'),
  );
  const activeUsers = userRows.filter((u) => u.logins > 0 || u.lastActiveAt !== null).length;

  const tabRows = [...tabViews.entries()]
    .map(([tabId, value]) => ({
      tabId,
      title: tabs.find((t) => t.id === tabId)?.title ?? tabId,
      views: value.views,
      users: value.users.size,
    }))
    .sort((a, b) => b.views - a.views || a.title.localeCompare(b.title, 'sl'));

  return {
    logins: { total: totalLogins, activeUsers, inactiveUsers: userRows.length - activeUsers },
    byUser: userRows,
    tabs: tabRows,
  };
}
