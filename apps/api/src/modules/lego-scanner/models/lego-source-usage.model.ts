// Model dnevne porabe virov je od 019 skupen (`platform/external-sources`); `LegoSourceUsageModel` je
// samo drugo ime za isti model, da stare uvozne poti ostanejo veljavne.

export {
  EXTERNAL_USAGE_RETENTION_DAYS as LEGO_USAGE_RETENTION_DAYS,
  EXTERNAL_USAGE_SOURCES as LEGO_USAGE_SOURCES,
  ExternalSourceUsageModel as LegoSourceUsageModel,
} from '../../../platform/external-sources/models/external-source-usage.model.js';
export type { ExternalSourceUsageDoc as LegoSourceUsageDoc } from '../../../platform/external-sources/models/external-source-usage.model.js';
