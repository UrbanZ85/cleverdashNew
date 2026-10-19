import { z } from 'zod';
import { NOTIFICATION_STATUSES, RESULT_SORTS, SCHEDULE_PRESET_IDS } from '../types.js';

// Zod sheme OVOJNICE skenerja (FR-006, FR-041) in poizvedb. Oblika `config` tu NI določena —
// preveri jo tip (`ScannerType.configSchema`); jedro sprejme samo JSON (brez funkcij in razredov,
// FR-005), kar `jsonValueSchema` uveljavi rekurzivno.

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(jsonValueSchema)]),
);

export const configEnvelopeSchema = z.record(jsonValueSchema);

export const scheduleInputSchema = z.object({
  preset: z.enum(SCHEDULE_PRESET_IDS).optional(),
  cronExpression: z.string().trim().min(1).max(100).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
});
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

export const notificationsInputSchema = z.object({
  enabled: z.boolean().optional(),
});

export const definitionCreateSchema = z.object({
  name: z.string().trim().min(1, 'Ime je obvezno.').max(80, 'Ime ima lahko največ 80 znakov.'),
  type: z.string().trim().min(1).max(40),
  enabled: z.boolean().default(true),
  /** 017: analiza z umetno inteligenco, privzeto IZKLOPLJENA (plačljiva). */
  aiEnabled: z.boolean().default(false),
  schedule: scheduleInputSchema.default({}),
  notifications: notificationsInputSchema.default({}),
  config: configEnvelopeSchema,
});
export type DefinitionCreateInput = z.infer<typeof definitionCreateSchema>;

export const definitionPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    enabled: z.boolean().optional(),
    aiEnabled: z.boolean().optional(),
    schedule: scheduleInputSchema.optional(),
    notifications: notificationsInputSchema.optional(),
    config: configEnvelopeSchema.optional(),
  })
  .refine((p) => Object.keys(p).length > 0, { message: 'Vsaj eno polje mora biti navedeno.' });
export type DefinitionPatchInput = z.infer<typeof definitionPatchSchema>;

export const listQuerySchema = z.object({
  type: z.string().trim().min(1).max(40).optional(),
});

export const resultsQuerySchema = z.object({
  sort: z.enum(RESULT_SORTS).default('seen'),
  includeUnavailable: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type ResultsQuery = z.infer<typeof resultsQuerySchema>;

export const runsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminRunsQuerySchema = z.object({
  type: z.string().trim().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(30),
});

export const adminNotificationsQuerySchema = z.object({
  type: z.string().trim().min(1).max(40).optional(),
  status: z.enum(NOTIFICATION_STATUSES).optional(),
  runId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const typeSchedulePutSchema = z
  .object({
    enabled: z.boolean().optional(),
    preset: z.enum(SCHEDULE_PRESET_IDS).optional(),
    cronExpression: z.string().trim().min(1).max(100).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
  })
  .refine((p) => Object.keys(p).length > 0, { message: 'Vsaj eno polje mora biti navedeno.' });
export type TypeSchedulePatch = z.infer<typeof typeSchedulePutSchema>;

/** Natanko eno od `type` (batch tip) ali `scannerId` (single skener). */
export const adminTriggerSchema = z
  .object({
    type: z.string().trim().min(1).max(40).optional(),
    scannerId: z.string().trim().min(1).optional(),
  })
  .refine((p) => (p.type ? 1 : 0) + (p.scannerId ? 1 : 0) === 1, {
    message: 'Navedi natanko eno od `type` (zagon tipa) ali `scannerId` (zagon skenerja).',
  });
export type AdminTriggerInput = z.infer<typeof adminTriggerSchema>;
