import { loadEnv } from '../../../platform/config/env.js';
import { ProblemError, notFound } from '../../../platform/errors/problem.js';
import { CameraEmbedAllowlistModel } from '../models/camera-embed-allowlist.model.js';

// research.md §6: efektivni seznam dovoljenih gostiteljev za vdelavo (FR-022) je unija
// osnovnega seznama iz okolja (`CAMERA_ALLOWED_EMBED_HOSTS`, nespremenljiv prek API-ja) in
// uporabniško odobrenih gostiteljev (`cameraEmbedAllowlist`, spremenljiv prek API-ja).

export interface EmbedHostEntry {
  host: string;
  source: 'base' | 'user';
  addedReason?: string | null;
}

export function parseBaseHosts(csv: string): string[] {
  return csv
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0);
}

export async function listEffectiveEmbedHosts(): Promise<EmbedHostEntry[]> {
  const env = loadEnv();
  const base: EmbedHostEntry[] = parseBaseHosts(env.CAMERA_ALLOWED_EMBED_HOSTS).map((host) => ({
    host,
    source: 'base',
  }));
  const userDocs = await CameraEmbedAllowlistModel.find().lean();
  const user: EmbedHostEntry[] = userDocs.map((d) => ({
    host: d.host,
    source: 'user',
    addedReason: d.addedReason ?? null,
  }));
  return [...base, ...user];
}

/** Samo imena gostiteljev — kar `domain/camera-validation.ts` potrebuje kot parameter. */
export async function listEffectiveHostNames(): Promise<string[]> {
  return (await listEffectiveEmbedHosts()).map((e) => e.host);
}

export async function addEmbedHost(host: string, addedReason?: string | null) {
  const normalized = host.trim().toLowerCase();
  const env = loadEnv();
  if (parseBaseHosts(env.CAMERA_ALLOWED_EMBED_HOSTS).includes(normalized)) {
    throw new ProblemError(422, 'Gostitelj je že dovoljen', `"${normalized}" je že na osnovnem seznamu.`);
  }
  const existing = await CameraEmbedAllowlistModel.findOne({ host: normalized });
  if (existing) return existing;
  return CameraEmbedAllowlistModel.create({ host: normalized, addedReason: addedReason ?? null });
}

/** Samo `source: user` gostitelje je mogoče odstraniti — osnovni seznam je sprememba
 * okolja, ne podatka (research.md §6). */
export async function removeEmbedHost(host: string): Promise<void> {
  const normalized = host.trim().toLowerCase();
  const env = loadEnv();
  if (parseBaseHosts(env.CAMERA_ALLOWED_EMBED_HOSTS).includes(normalized)) {
    throw new ProblemError(
      422,
      'Ni mogoče odstraniti',
      `"${normalized}" je del osnovnega seznama (CAMERA_ALLOWED_EMBED_HOSTS), ne podatka.`,
    );
  }
  const result = await CameraEmbedAllowlistModel.deleteOne({ host: normalized });
  if (result.deletedCount === 0) {
    throw notFound(`Gostitelj "${normalized}" ni na uporabniškem seznamu.`);
  }
}
