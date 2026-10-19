import { Types } from 'mongoose';
import { ScannerDefinitionModel } from '../models/scanner-definition.model.js';
import { ScannerResultModel } from '../models/scanner-result.model.js';
import { NOTIFIABLE_CHANGE_TYPES, type AiAnalysis, type AiAnalysisHooks, type AiAnalysisInput, type AiCandidate, type AiCandidatesContext, type ResultView } from '../types.js';
import { toResultView, type ResultLean } from './result-store.service.js';

// Privzeti kavlji analize za tipe z GENERIČNO shrambo (017, research.md §10): tip ne napiše nič
// in dobi analizo; lahko poda samo `describe`, da vhod obogati (opis, slike). Tip z lastno shrambo
// (leti) poda svoja `candidates` in `store` v `ScannerType.ai`.
//
// Kandidat (FR-007): rezultat skenerja z `aiEnabled`, ki je `available` in (a) v TEM zagonu nov ali
// spremenjen (`lastSeenAt === now`, `lastChangeType` obvestljiv) ali (b) še brez analize — da vklop
// pri obstoječem skenerju analizira sedanje rezultate postopno (meja na zagon), ne samo prihodnjih.

const MAX_ATTRIBUTES = 40;

function flatten(value: unknown, prefix: string, out: Record<string, string | number | boolean | null>, depth: number): void {
  if (Object.keys(out).length >= MAX_ATTRIBUTES) return;
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    if (prefix) out[prefix] = typeof value === 'string' ? value.slice(0, 300) : value;
    return;
  }
  if (depth >= 3) return;
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === 'string' || typeof v === 'number')) {
      if (prefix) out[prefix] = value.slice(0, 20).join(', ').slice(0, 300);
      return;
    }
    value.slice(0, 10).forEach((v, i) => flatten(v, prefix ? `${prefix}_${i}` : String(i), out, depth + 1));
    return;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'description' || k === 'images') continue; // gresta v lastni polji
      flatten(v, prefix ? `${prefix}_${k}` : k, out, depth + 1);
    }
  }
}

/** Privzeti vhod iz generičnega rezultata: naslov, vir, povezava, cena, `data` sploščeno v lastnosti. */
export function defaultAiInput(result: ResultView): AiAnalysisInput {
  const data = (typeof result.data === 'object' && result.data !== null ? result.data : {}) as Record<string, unknown>;
  const attributes: Record<string, string | number | boolean | null> = {};
  flatten(data, '', attributes, 0);
  return {
    title: result.title,
    description: typeof data.description === 'string' ? data.description : null,
    source: result.source,
    url: result.url,
    price: result.price,
    previousPrice: result.previousPrice ? { amount: result.previousPrice.amount, currency: result.previousPrice.currency } : null,
    attributes,
    images: Array.isArray(data.images) ? data.images.filter((i): i is string => typeof i === 'string') : [],
  };
}

export async function genericAiCandidates(ctx: AiCandidatesContext, describe: AiAnalysisHooks['describe'] | undefined): Promise<AiCandidate[]> {
  const filter: Record<string, unknown> = { type: ctx.scannerType, aiEnabled: true };
  if (ctx.definitionId) filter._id = new Types.ObjectId(ctx.definitionId);
  const definitions = await ScannerDefinitionModel.find(filter).select('_id').lean<Array<{ _id: Types.ObjectId }>>();
  if (definitions.length === 0) return [];
  const ids = definitions.map((d) => d._id);
  const rows = await ScannerResultModel.find({
    definitionId: { $in: ids },
    availability: 'available',
    $or: [{ lastSeenAt: ctx.now, lastChangeType: { $in: [...NOTIFIABLE_CHANGE_TYPES] } }, { aiAnalysis: null }],
  })
    .sort({ lastSeenAt: -1, firstSeenAt: -1 })
    .limit(ctx.limit)
    .lean<Array<ResultLean & { aiAnalysis?: AiAnalysis | null }>>();
  return rows.map((row) => {
    const view = toResultView(row);
    return {
      ref: String(row._id),
      definitionId: String(row.definitionId),
      input: describe ? describe(view) : defaultAiInput(view),
      previousInputHash: row.aiAnalysis?.inputHash ?? null,
    };
  });
}

/** Shrani analizo na rezultat; `false`, kadar rezultata ni več ali ni več na voljo (ni napaka). */
export async function genericAiStore(ref: string, analysis: AiAnalysis): Promise<boolean> {
  if (!Types.ObjectId.isValid(ref)) return false;
  const res = await ScannerResultModel.updateOne({ _id: new Types.ObjectId(ref), availability: 'available' }, { $set: { aiAnalysis: analysis } });
  return res.matchedCount > 0;
}
