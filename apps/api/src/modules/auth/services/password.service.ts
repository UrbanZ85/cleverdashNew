import argon2 from 'argon2';

// FR-010: geslo je shranjeno izključno kot soljen zgoščen zapis; čistopis se nikoli ne
// shrani ali zabeleži. Argon2id je privzeta izbira (docs/env-reference.md, PASSWORD_HASH_ALGO).

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

export function assertPasswordStrength(plain: string): void {
  if (plain.length < 12) {
    throw new Error('Geslo mora imeti vsaj 12 znakov.');
  }
}
