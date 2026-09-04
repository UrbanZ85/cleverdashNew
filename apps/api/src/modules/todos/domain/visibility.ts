// Čista domenska plast (člen IX): sestavi pogoj poizvedbe, ne izvede je.
//
// Ta pogoj je EDINO mesto v modulu, kjer je zapisano, kaj pomeni "seznam, ki ga smem videti".
// Kopija tega izraza bi bila mesto, kjer se članska veja nekoč pozabi in kjer deljen seznam
// tiho izgine iz izpisa — brez napake, brez sledi v dnevniku, samo manjkajoča vrstica. Zato
// vsak endpoint, ki bere sezname, kliče to funkcijo in nihče ne piše svojega `$or`.

/**
 * Pogoj "seznami, do katerih ima ta uporabnik dostop": lastni ALI deljeni z njim.
 *
 * Uporablja se na dva načina in oba sta namerna:
 *
 * 1. Kot filter izpisa (`GET /todos/lists`, `GET /todos/current`).
 * 2. Kot del filtra pri branju ENEGA seznama (`resolveListAccess`) — tam poskrbi, da tuj
 *    seznam ne pride niti v pomnilnik in da 404 pade iz odsotnosti zadetka, ne iz naknadne
 *    primerjave v kodi. Naknadna primerjava je oblika, v kateri se 403 tujcu prikrade.
 *
 * Vrne navaden objekt in ne Mongoosovega tipa, da ta plast ostane brez uvoza baze.
 */
export function buildVisibleListsFilter(userId: string): {
  $or: [{ ownerId: string }, { 'members.userId': string }];
} {
  return { $or: [{ ownerId: userId }, { 'members.userId': userId }] };
}
