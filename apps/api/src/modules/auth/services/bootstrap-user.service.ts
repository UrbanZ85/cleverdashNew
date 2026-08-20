import { UserModel } from '../models/user.model.js';
import { hashPassword } from './password.service.js';
import type { Env } from '../../../platform/config/env.js';
import type { Logger } from '../../../platform/logging/logger.js';

// FR-014, FR-016: sistem je enouporabniški. Ob prvem zagonu nastane natanko en uporabnik
// iz ADMIN_EMAIL/ADMIN_INITIAL_PASSWORD, z mustChangePassword=true. Če uporabnik že
// obstaja (kateri koli), se ne ustvari nov — "natanko en" velja tudi po restartu.
export async function ensureBootstrapUser(
  env: Pick<Env, 'ADMIN_EMAIL' | 'ADMIN_INITIAL_PASSWORD'>,
  logger: Logger,
): Promise<void> {
  const existingCount = await UserModel.countDocuments({});
  if (existingCount > 0) return;

  const passwordHash = await hashPassword(env.ADMIN_INITIAL_PASSWORD);
  await UserModel.create({
    email: env.ADMIN_EMAIL,
    passwordHash,
    scopes: ['admin'],
    mustChangePassword: true,
  });
  logger.info({ event: 'auth.bootstrap', email: env.ADMIN_EMAIL }, 'Začetni uporabnik ustvarjen');
}
