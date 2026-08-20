import { createHash } from 'node:crypto';
import { LoginAttemptModel } from '../models/login-attempt.model.js';
import { tooManyRequests } from '../../../platform/errors/problem.js';

// FR-015: po 5 neuspelih poskusih za isti e-poštni naslov v 15 minutah se prijava zavrne
// z 429 in enotnim sporočilom, ki ne razkriva, ali račun obstaja.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

export async function assertNotThrottled(email: string): Promise<void> {
  const since = new Date(Date.now() - WINDOW_MS);
  const recentFailures = await LoginAttemptModel.countDocuments({
    email: email.toLowerCase(),
    success: false,
    attemptedAt: { $gte: since },
  });
  if (recentFailures >= MAX_ATTEMPTS) {
    throw tooManyRequests('Preveč neuspelih poskusov prijave. Poskusi znova pozneje.');
  }
}

export async function recordAttempt(email: string, ip: string, success: boolean): Promise<void> {
  await LoginAttemptModel.create({
    email: email.toLowerCase(),
    ipHash: hashIp(ip),
    success,
  });
}
