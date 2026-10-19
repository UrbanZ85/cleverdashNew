import { Types } from 'mongoose';
import type { Env } from '../../config/env.js';
import { badRequest, notFound } from '../../errors/problem.js';
import { ScannerDefinitionModel } from '../models/scanner-definition.model.js';
import { findScannerType } from '../registry.js';
import type { AnyScannerType, DefinitionOutcome, NotificationMode, ScheduleMode, SchedulePresetId } from '../types.js';

// EDINA vrata do generične definicije v jedru. Vsaka pot gre skozi `requireOwnDefinition`; nikjer
// drugje se `ScannerDefinitionModel.findOne` ne kliče z ročno sestavljenim pogojem dostopa.
// Model dostopa je `{ _id, userId }` (FR-007); tuj skener vrne 404, nikoli 403.

export interface DefinitionLean {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  type: string;
  enabled: boolean;
  /** 017; zapisi izpred uvedbe ga nimajo → `false`. */
  aiEnabled?: boolean;
  schedule: { mode: ScheduleMode; preset: SchedulePresetId; cronExpression: string; timezone: string; lastScheduledSlotAt: Date | null };
  notifications: { enabled: boolean; mode: NotificationMode };
  config: Record<string, unknown>;
  status: { lastRunId: Types.ObjectId | null; lastRunAt: Date | null; lastOutcome: DefinitionOutcome | null; message: string | null; lastSuccessAt: Date | null };
  createdAt: Date;
  updatedAt: Date;
}

/** Neveljaven ObjectId bi v Mongoose vrgel CastError, ki se navzven pokaže kot 500 — za
 * uporabnika, ki je odprl staro povezavo, je to 404 (isti vzorec kot 007/010/013/015). */
export function requireObjectId(value: string, what: string): string {
  if (!Types.ObjectId.isValid(value)) throw notFound(`${what} ne obstaja.`);
  return value;
}

export async function requireOwnDefinition(userId: string, id: string): Promise<DefinitionLean> {
  const def = await ScannerDefinitionModel.findOne({ _id: requireObjectId(id, 'Skener'), userId: new Types.ObjectId(userId) }).lean<DefinitionLean | null>();
  if (!def) throw notFound('Skener ne obstaja.');
  return def;
}

export async function listOwnDefinitions(userId: string, type?: string): Promise<DefinitionLean[]> {
  const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
  if (type) filter.type = type;
  return ScannerDefinitionModel.find(filter).sort({ updatedAt: -1 }).lean<DefinitionLean[]>();
}

export async function assertRoomForDefinition(userId: string, type: string, max: number): Promise<void> {
  const count = await ScannerDefinitionModel.countDocuments({ userId: new Types.ObjectId(userId), type });
  if (count >= max) throw badRequest(`Dosegel si mejo ${max} skenerjev tega tipa. Izbriši ali združi kakšnega, preden ustvariš novega.`);
}

/** Tip mora biti registriran in vklopljen; sicer 400 z razlago (FR-011). */
export function requireRegisteredEnabledType(typeId: string, env: Env): AnyScannerType {
  const type = findScannerType(typeId);
  if (!type) throw badRequest(`Tip skenerja "${typeId}" v tej namestitvi ni na voljo.`);
  if (!type.isEnabled(env)) throw badRequest(`Tip skenerja "${type.label}" je v tej namestitvi izklopljen.`);
  return type;
}

/** Tip z lastnimi definicijami (leti) se ne ustvarja prek jedra — čarovnik preusmeri na `createRoute`. */
export function assertGenericDefinitions(type: AnyScannerType): void {
  if (type.definitions) {
    throw badRequest(
      `Skenerji tipa "${type.label}" se ustvarjajo na lastni strani tipa${type.createRoute ? ` (${type.createRoute})` : ''}, ne prek splošnega seznama.`,
    );
  }
}

/** Oblika prek Zod sheme tipa, pomen prek `validateConfig`; vrne normaliziran `config` ali vrže 400 s
 * slovenskim stavkom (prvo sporočilo sheme). */
export function validateConfigWithType(type: AnyScannerType, config: Record<string, unknown>, env: Env): Record<string, unknown> {
  const parsed = type.configSchema.safeParse(config);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path?.length ? `${issue.path.join('.')}: ` : '';
    throw badRequest(`Nastavitve skenerja niso veljavne — ${where}${issue?.message ?? 'neveljavna oblika'}.`);
  }
  const normalized = parsed.data as never;
  const semantic = type.validateConfig?.(normalized, env);
  if (semantic) throw badRequest(semantic);
  return normalized as unknown as Record<string, unknown>;
}
