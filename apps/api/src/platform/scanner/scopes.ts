// Skupna obsega jedra skenerjev (016): seznam, generične definicije, rezultati. Nizi so PREPISANI
// tudi v `platform/keycloak/role-mapping.ts` (`BASE_USER_SCOPES`), ne uvoženi od tam.
//
// Obsegi posameznih TIPOV (npr. `flight-deals:read`) ostanejo last tipa (`ScannerType.scopes`);
// jedro jih uporabi pri izbiri, kateri tipi so klicatelju na voljo, in pri dostopu do definicij
// tega tipa. Tip brez lastnih obsegov uporablja ta dva.
export const SCANNER_SCOPES = {
  read: 'scanners:read',
  write: 'scanners:write',
} as const;
