// FR-089/FR-095, research.md §4: katero telo je še mogoče pretakati na disk.
//
// Pot za oddajo bere `req` kot TOK (services/upload.service.ts) in ne registrira nobenega
// razčlenjevalnika. Iz tega sledi past, ki jo lovi ta funkcija: če pošiljatelj napove telo, ki
// ga razčlenjevalnik prepozna, ga bo nekdo pred nami POŽRL ali pa bo shranjeno kot smet.
//
//  - `application/json` — globalni `express.json()` iz main.ts telo prebere in tok je do našega
//    upravljalnika prazen. Brez te varovalke bi bil izid datoteka velikosti 0 in sporočilo
//    "datoteka je prazna", česar pošiljatelj ne more razvozlati.
//  - `multipart/form-data` — tega ne razčleni nihče, zato bi se na disk zapisale MEJE OBRAZCA
//    skupaj z vsebino. Datoteka bi bila videti uspešno oddana in bi bila pokvarjena — natanko
//    tiha napaka, ki jo prepovedujeta člena VI in VII.
//  - `application/x-www-form-urlencoded` — privzetek `curl --data-binary` brez glave. Isti
//    razlog kot zgoraj in pogosta napaka pri klicu iz avtomatizacije.
//
// Odsotna glava je DOVOLJENA: telo brez napovedi vrste je surovo telo, in zavrnitev bi po
// nepotrebnem izključila odjemalce, ki glave ne pošljejo.
//
// Člen IX: čista funkcija.

const REFUSED = ['application/json', 'multipart/', 'application/x-www-form-urlencoded'];

export function isStreamableBody(contentType: string | undefined | null): boolean {
  if (contentType === undefined || contentType === null || contentType === '') return true;
  const value = contentType.toLowerCase();
  return !REFUSED.some((prefix) => value.startsWith(prefix));
}
