import { describe, expect, it } from 'vitest';
import { SettingsModel } from '../../src/modules/settings/model.js';
import { ExternalCacheModel } from '../../src/platform/cache/model.js';
import { UserModel } from '../../src/modules/auth/models/user.model.js';
import { CameraModel } from '../../src/modules/cameras/models/camera.model.js';
import { CameraGroupModel } from '../../src/modules/cameras/models/camera-group.model.js';
import { CameraEmbedAllowlistModel } from '../../src/modules/cameras/models/camera-embed-allowlist.model.js';
import { HolidayModel } from '../../src/modules/time-tracking/models/holiday.model.js';
import { TrackingProfileModel } from '../../src/modules/time-tracking/models/tracking-profile.model.js';
import { TrackingLocationModel } from '../../src/modules/time-tracking/models/tracking-location.model.js';
import { PlannedActionModel } from '../../src/modules/time-tracking/models/planned-action.model.js';
import { ActionRecordModel } from '../../src/modules/time-tracking/models/action-record.model.js';
import { ActionAttemptModel } from '../../src/modules/time-tracking/models/action-attempt.model.js';
import { CalendarDayModel } from '../../src/modules/time-tracking/models/calendar-day.model.js';
import { CalendarOverrideModel } from '../../src/modules/time-tracking/models/calendar-override.model.js';
import { AbsencePeriodModel } from '../../src/modules/time-tracking/models/absence-period.model.js';
import { RemoteSessionModel } from '../../src/modules/time-tracking/models/remote-session.model.js';
import { TodoListModel } from '../../src/modules/todos/models/todo-list.model.js';

// 004, data-model.md "Načelo lastništva zapisov": OBRNJENO iz 001/003 (glej git zgodovino
// te datoteke) — sistem je zdaj večuporabniški. Ta test preveri OBE strani nove razmejitve
// (research.md §5): osebni podatki nosijo `userId`, skupna referenčna/varnostna podatki NE.

describe('data-model.md "Načelo lastništva zapisov": userId na osebnih podatkih', () => {
  const personal = [
    ['Settings', SettingsModel],
    ['Camera', CameraModel],
    ['CameraGroup', CameraGroupModel],
    ['TrackingProfile', TrackingProfileModel],
    ['TrackingLocation', TrackingLocationModel],
    ['PlannedAction', PlannedActionModel],
    ['ActionRecord', ActionRecordModel],
    ['ActionAttempt', ActionAttemptModel],
    ['CalendarDay', CalendarDayModel],
    ['CalendarOverride', CalendarOverrideModel],
    ['AbsencePeriod', AbsencePeriodModel],
    ['RemoteSession', RemoteSessionModel],
  ] as const;

  it.each(personal)('%s NOSI userId', (_name, model) => {
    expect(Object.keys(model.schema.paths)).toContain('userId');
  });

  const shared = [
    ['Holiday', HolidayModel],
    ['CameraEmbedAllowlist', CameraEmbedAllowlistModel],
    ['ExternalCache', ExternalCacheModel],
  ] as const;

  it.each(shared)('%s (skupna referenčna/varnostna tabela) NE nosi userId', (_name, model) => {
    expect(Object.keys(model.schema.paths)).not.toContain('userId');
  });

  it('User nima lastnega userId (uporabnik je sam sebi entiteta, ne referenca)', () => {
    expect(Object.keys(UserModel.schema.paths)).not.toContain('userId');
  });
});

// 010, data-model.md "Načelo lastništva zapisov": TRETJA kategorija, ki je 004 še ni imela —
// zapis, ki je oseben, a ga NAMENOMA bere tudi kdo drug.
//
// `userId` v tej bazi pomeni "ta zapis je zaseben in `{ _id, userId }` je pogoj dostopa". Pri
// deljenem seznamu ta obljuba ne drži: soudeleženec bere zapis, katerega lastnik ni, dostop pa
// odloči `resolveListAccess` (modules/todos/services/list-access.service.ts). Polje se zato
// imenuje `ownerId` — da je odstop GLASEN in ne skrit, in da noben bodoči bralec ne sklepa na
// izolacijo, ki je ta model ne daje.
describe('data-model.md (010): deljen zapis nosi ownerId in members, NE userId', () => {
  it('TodoList nosi ownerId', () => {
    expect(Object.keys(TodoListModel.schema.paths)).toContain('ownerId');
  });

  it('TodoList NE nosi userId — ime bi obljubljalo izolacijo, ki je ni', () => {
    expect(Object.keys(TodoListModel.schema.paths)).not.toContain('userId');
  });

  it('TodoList nosi members — vidnost je širša od lastništva', () => {
    expect(Object.keys(TodoListModel.schema.paths)).toContain('members');
  });

  it('vsak soudeleženec ima userId in vlogo', () => {
    // `path('members')` je pot do polja poddokumentov; njena `schema` je shema ENEGA
    // soudeleženca. Mongoose jo tipizira kot neobvezno, zato eksplicitna oblika namesto `any`.
    const members = TodoListModel.schema.path('members') as unknown as {
      schema?: { paths: Record<string, unknown> };
    };
    const memberPaths = Object.keys(members.schema?.paths ?? {});
    expect(memberPaths).toContain('userId');
    expect(memberPaths).toContain('role');
  });
});
