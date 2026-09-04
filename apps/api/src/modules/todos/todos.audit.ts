import type { Logger } from '../../platform/logging/logger.js';

// FR-052: deljenje, odvzem dostopa in zaklep so strukturirano zabeleženi. Vzorec je
// `modules/auth/auth.audit.ts` — tanka tipizirana ovojnica nad `logger.info`, ne svoja zbirka.
//
// Zakaj ovojnica in ne klici `req.log.info` na mestu: dogodki, ki zadenejo DRUGEGA človeka, so
// edini v tem modulu, pri katerih je pomembno, da imajo stalno obliko. Raztreseni klici se
// razidejo v imenih polj, in dnevnik, po katerem ni mogoče iskati, ni dnevnik.
//
// Beležijo se IZKLJUČNO identifikatorji. Nikoli vsebina opravil in nikoli e-pošta: dnevnik
// preživi izbris seznama, vsebina pa ne sme.
//
// Kar mora videti UPORABNIK, ni tu, ampak v odgovoru API-ja (`members`, `locked`, `isNew`) —
// hišni slog je, da dejstvo, ki ga mora nekdo videti, ne živi v dnevniku, ki ga nihče ne bere.

interface ShareParams {
  actorUserId: string;
  listId: string;
  targetUserId: string;
  role: string;
}

export function auditListShared(logger: Logger | undefined, params: ShareParams): void {
  logger?.info({ event: 'todos.list.shared', ...params }, 'Seznam opravil deljen');
}

export function auditMemberRoleChanged(logger: Logger | undefined, params: ShareParams): void {
  logger?.info({ event: 'todos.list.role_changed', ...params }, 'Stopnja soudeleženca spremenjena');
}

export function auditListUnshared(
  logger: Logger | undefined,
  params: { actorUserId: string; listId: string; targetUserId: string; selfLeave: boolean },
): void {
  logger?.info(
    { event: 'todos.list.unshared', ...params },
    params.selfLeave ? 'Soudeleženec je zapustil seznam' : 'Dostop do seznama odvzet',
  );
}

export function auditListLockChanged(
  logger: Logger | undefined,
  params: { actorUserId: string; listId: string; locked: boolean },
): void {
  logger?.info(
    { event: params.locked ? 'todos.list.locked' : 'todos.list.unlocked', ...params },
    params.locked ? 'Seznam zaklenjen' : 'Seznam odklenjen',
  );
}
