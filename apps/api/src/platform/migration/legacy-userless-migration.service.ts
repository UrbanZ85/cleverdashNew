import { UserModel } from '../../modules/auth/models/user.model.js';
import { SettingsModel } from '../../modules/settings/model.js';
import { CameraModel } from '../../modules/cameras/models/camera.model.js';
import { CameraGroupModel } from '../../modules/cameras/models/camera-group.model.js';
import { TrackingProfileModel } from '../../modules/time-tracking/models/tracking-profile.model.js';
import { TrackingLocationModel } from '../../modules/time-tracking/models/tracking-location.model.js';
import { PlannedActionModel } from '../../modules/time-tracking/models/planned-action.model.js';
import { ActionRecordModel } from '../../modules/time-tracking/models/action-record.model.js';
import { ActionAttemptModel } from '../../modules/time-tracking/models/action-attempt.model.js';
import { CalendarDayModel } from '../../modules/time-tracking/models/calendar-day.model.js';
import { CalendarOverrideModel } from '../../modules/time-tracking/models/calendar-override.model.js';
import { AbsencePeriodModel } from '../../modules/time-tracking/models/absence-period.model.js';
import { RemoteSessionModel } from '../../modules/time-tracking/models/remote-session.model.js';

// research.md §7, FR-013/FR-014, quickstart.md §6, tasks.md T053: aplikacija je bila pred 004
// enouporabniška — vsi obstoječi dokumenti nimajo `userId`. Ob PRVI prijavi uporabnika z
// `admin` scope-om (Keycloakova vloga `KEYCLOAK_ADMIN_ROLE`), ki še ni izvedel prevzema, se
// mu vsi taki "osirotel" dokumenti pripišejo. Kasnejši novi uporabniki (tudi drugi admini) jih
// NE podedujejo — `User.migratedLegacyDataAt` je varovalka, ki to zagotovi kvečjemu enkrat.
//
// Popravek med implementacijo: prvotno je bila ta datoteka `modules/auth/services/migration.service.ts`
// — a njena naloga je PO NARAVI medmodulska (dotika Settings, Camera/CameraGroup,
// TrackingProfile/... iz treh različnih modulov), kar je natanko to, kar člen I ustave ("moduli
// se ne kličejo med sabo neposredno") prepoveduje modulom med sabo. Selitev v `platform/` je
// skladna z isto opombo v ustavi: "komunikacija poteka izključno prek skupnih storitev" — glej
// tudi `npm run lint` (`cleverdash/module-boundary`), ki je to napako ujel.
export const LEGACY_OWNERLESS_MODELS = [
  SettingsModel,
  CameraModel,
  CameraGroupModel,
  TrackingProfileModel,
  TrackingLocationModel,
  PlannedActionModel,
  ActionRecordModel,
  ActionAttemptModel,
  CalendarDayModel,
  CalendarOverrideModel,
  AbsencePeriodModel,
  RemoteSessionModel,
];

/** Pokliči ob vsaki prijavi (GET /auth/callback), takoj po user-provisioning. Brez učinka za
 * neadmin uporabnike ali če je prevzem že bil izveden (za kateregakoli uporabnika). Atomsko
 * "zaklene" prevzem prek pogojnega `findOneAndUpdate`, da vzporedne prijave istega admina ne
 * bi podvojile dela. */
export async function migrateLegacyDataIfNeeded(userId: string, isAdmin: boolean): Promise<void> {
  if (!isAdmin) return;

  const claimed = await UserModel.findOneAndUpdate(
    { _id: userId, migratedLegacyDataAt: null },
    { $set: { migratedLegacyDataAt: new Date() } },
  );
  if (!claimed) return; // ni admin (nemogoče tu, preverjeno zgoraj) ali je prevzem že izveden

  for (const LegacyModel of LEGACY_OWNERLESS_MODELS) {
    await LegacyModel.updateMany({ userId: { $exists: false } }, { $set: { userId } });
  }
}
