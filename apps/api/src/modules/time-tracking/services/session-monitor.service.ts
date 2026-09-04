import { DateTime } from 'luxon';
import { RemoteSessionModel } from '../models/remote-session.model.js';
import { notify } from '../../../platform/notifications/notify.service.js';
import { dispatchEvent } from '../../../platform/webhooks/dispatcher.service.js';

// FR-063: poteklost seje se preverja DNEVNO; opozorilo pride najmanj 7 dni pred iztekom,
// privzeto tudi še ob 3 dneh in 1 dnevu. Story 8 — seja je edina "identiteta" v
// podedovanem sistemu (Podedovane omejitve #1), njena poteklost je najverjetnejši vzrok
// tihe odpovedi celotnega urnika.

const WARNING_THRESHOLDS_DAYS = [7, 3, 1];

/** Celoštevilski dnevi do izteka, zaokroženi navzdol — `daysUntilExpiry` je namenoma
 * konsistenten ne glede na uro dneva klica (Europe/Ljubljana). */
export function daysUntilExpiry(expiresAt: Date, now: Date = new Date()): number {
  const zone = 'Europe/Ljubljana';
  const expiryDay = DateTime.fromJSDate(expiresAt, { zone: 'utc' }).setZone(zone).startOf('day');
  const today = DateTime.fromJSDate(now, { zone: 'utc' }).setZone(zone).startOf('day');
  return Math.floor(expiryDay.diff(today, 'days').days);
}

/** Poišče vse seje z znanim rokom veljavnosti, posodobi njihov `status` in pošlje
 * opozorilo, ko preostanek doseže enega od pragov. Klicati je varno na vsak tik —
 * `notify()`-jev `dedupeKey` naravno prepreči ponovno pošiljanje istega praga isti dan. */
export async function checkSessionExpiry(): Promise<void> {
  const sessions = await RemoteSessionModel.find({ expiresAt: { $ne: null } });

  for (const session of sessions) {
    if (!session.expiresAt) continue;
    const remaining = daysUntilExpiry(session.expiresAt);

    const status = remaining <= 0 ? 'expired' : remaining <= 7 ? 'expiring' : session.status;
    if (session.status !== status) {
      session.status = status;
      await session.save();
    }

    if (WARNING_THRESHOLDS_DAYS.includes(remaining)) {
      await notify({
        type: 'session',
        title: 'Beleženje časa — seja se izteka',
        body: `Seja "${session.name}" pri delodajalcu se izteče čez ${remaining} ${remaining === 1 ? 'dan' : 'dni'}. Vpiši nov sejni piškotek v Nastavitvah.`,
        dedupeKey: `session-expiry:${String(session._id)}:${remaining}`,
        deepLink: '/settings',
      });
      await dispatchEvent('session.expiring', {
        sessionId: String(session._id),
        name: session.name,
        daysUntilExpiry: remaining,
      });
    }
  }
}
