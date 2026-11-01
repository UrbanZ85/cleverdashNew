// Dnevna poraba virov je skupna vsem tipom skenerjev (`platform/external-sources/usage.ts`, izvlečeno v
// 019): meja je na ključ pri ponudniku, ne na tip. Ta datoteka ohranja stare uvozne poti LEGO modula.

export { readSourceUsage, reserveSourceRequest, usageDay } from '../../../platform/external-sources/usage.js';
export type { UsageSource } from '../../../platform/external-sources/usage.js';
