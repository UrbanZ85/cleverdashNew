// Obsegi modula Leti (015). Nizi so PREPISANI tudi v `platform/keycloak/role-mapping.ts`
// (`BASE_USER_SCOPES`), ne uvoženi od tam — člen I.
//
// `share` je ločen od `write` iz istega razloga kot pri 010 in 013: dodajanje prejemnika je
// edina poteza, ki drugi osebi odpre vpogled v ponudbe IN ji začne pošiljati e-pošto. API ključ
// za "n8n sme shraniti iskanje" tega ne sme dobiti zastonj.
export const FLIGHT_DEALS_SCOPES = {
  read: 'flight-deals:read',
  write: 'flight-deals:write',
  share: 'flight-deals:share',
} as const;
