import { createHash } from 'node:crypto';

// Stabilna identiteta rezultata v generični shrambi (FR-023). Kanonični niz sestavi TIP (ve, kaj
// isto stvar loči od druge — pri letih je to vir, letališči, čas odhoda, številke letov …), jedro
// ga samo hashira: 32 šestnajstiških znakov je dovolj za enoličnost znotraj enega skenerja in
// kratko za unikatni indeks `{ definitionId, identityKey }`.

export function identityKeyOf(identity: string): string {
  return createHash('sha256').update(identity).digest('hex').slice(0, 32);
}
