import type { ArsoStation } from './station-list-parse.js';

// Osnovni imenik ARSO samodejnih postaj.
//
// ZAKAJ OBSTAJA (ugotovljeno med implementacijo, 9. 9. 2026): `observationAms_si_latest.xml` NI
// imenik postaj, ampak posnetek ZADNJEGA OBJAVNEGA CIKLA. Ob 08:00 UTC je vseboval 106 postaj,
// ob 09:25 UTC istega dne samo 19 — in med njimi ni bilo niti Vrhnike niti Ljubljane Bežigrad.
// Isto velja za `observationAms_si_latest.html` in `observation_si_latest.xml`; imenika postaj
// ARSO ne objavlja (izpis mape vrne 403, XML dokumentacija ga ne omenja).
//
// Če bi seznam za nastavitve bral samo iz živega vira, bi bil odvisen od trenutka: uporabnik,
// ki bi nastavitve odprl ob 09:25, svoje postaje na seznamu NE BI NAŠEL. Zato je tu zapisan
// imenik, ki je unija več posnetkov, živi vir pa ga samo dopolni in osveži
// (`mergeStationCatalog`) — nova postaja se pojavi, ko prvič pride v cikel.
//
// Podatki so ARSO-jevi in niso skrivnost (člen IV ni v igri); `id` je `domain_meteosiId` brez
// zaključnega podčrtaja, `title` pa `domain_longTitle`. Osvežitev tega seznama ni nujna za
// delovanje — samo za to, da je nova postaja v ponudbi takoj in ne šele ob svojem ciklu.
//
// Seznam se osveži ročno z `node apps/api/scripts/refresh-arso-stations.mjs`, ki vir prebere
// večkrat in unijo DOPOLNI (ne nadomesti) — eno samo branje bi pobrisalo postaje, ki tisti
// trenutek niso objavile. Zapis je zato strojno berljiv: ena postaja na vrstico, v obliki, ki
// jo skripta tudi piše.
export const STATION_CATALOG: readonly ArsoStation[] = [
  { id: 'BABNO-POL', title: 'Babno Polje', altitudeM: 756, latitude: 45.6452, longitude: 14.5449 },
  { id: 'NOVA-GOR_BILJE', title: 'Bilje Nova Gorica', altitudeM: 55, latitude: 45.8956, longitude: 13.624 },
  { id: 'BLEGOS', title: 'Blegoš', altitudeM: 1188, latitude: 46.1675, longitude: 14.0816 },
  { id: 'BOHIN-CES', title: 'Bohinjska Češnjica', altitudeM: 596, latitude: 46.2942, longitude: 13.9422 },
  { id: 'BORST_GOREN-VAS', title: 'Boršt Gorenja vas', altitudeM: 564, latitude: 46.0854, longitude: 14.1819 },
  { id: 'BOVEC', title: 'Bovec', altitudeM: 452, latitude: 46.3317, longitude: 13.5538 },
  { id: 'BREGINJ', title: 'Breginj', altitudeM: 546, latitude: 46.2625, longitude: 13.4275 },
  { id: 'BUKOV-VRH', title: 'Bukovski vrh', altitudeM: 780, latitude: 46.1402, longitude: 13.8884 },
  { id: 'CELJE_MEDLOG', title: 'Celje', altitudeM: 244, latitude: 46.2366, longitude: 15.2259 },
  { id: 'CERKN-JEZ', title: 'Cerkniško jezero', altitudeM: 586, latitude: 45.723, longitude: 14.399 },
  { id: 'DAVCA', title: 'Davča', altitudeM: 1001, latitude: 46.1976, longitude: 14.0684 },
  { id: 'CRNOMELJ', title: 'Dobliče Črnomelj', altitudeM: 157, latitude: 45.56, longitude: 15.1462 },
  { id: 'AJDOV-INA_DOLENJE', title: 'Dolenje Ajdovščina', altitudeM: 83, latitude: 45.8662, longitude: 13.9013 },
  { id: 'GACNIK', title: 'Gačnik', altitudeM: 292, latitude: 46.6178, longitude: 15.6838 },
  { id: 'GODNJE', title: 'Godnje', altitudeM: 320, latitude: 45.7547, longitude: 13.8433 },
  { id: 'GORNJ-GRA', title: 'Gornji Grad', altitudeM: 428, latitude: 46.2987, longitude: 14.8063 },
  { id: 'HOCKO-POH', title: 'Hočko Pohorje', altitudeM: 585, latitude: 46.4919, longitude: 15.5875 },
  { id: 'HRASTNIK', title: 'Hrastnik', altitudeM: 290, latitude: 46.144, longitude: 15.0832 },
  { id: 'IDRIJA_CISTI-NAP', title: 'Idrija', altitudeM: 325, latitude: 46.0112, longitude: 14.0291 },
  { id: 'ILIRS-BIS', title: 'Ilirska Bistrica', altitudeM: 415, latitude: 45.5531, longitude: 14.2355 },
  { id: 'ISKRBA', title: 'Iskrba', altitudeM: 532, latitude: 45.5612, longitude: 14.858 },
  { id: 'JERONIM', title: 'Jeronim', altitudeM: 760, latitude: 46.2668, longitude: 14.9481 },
  { id: 'JERUZ-LEM', title: 'Jeruzalem', altitudeM: 335, latitude: 46.4759, longitude: 16.188 },
  { id: 'JEZERSKO', title: 'Jezersko', altitudeM: 894, latitude: 46.405, longitude: 14.5146 },
  { id: 'KAMNI-BIS', title: 'Kamniška Bistrica', altitudeM: 549, latitude: 46.3087, longitude: 14.6034 },
  { id: 'KANIN', title: 'Kanin', altitudeM: 2260, latitude: 46.3581, longitude: 13.4744 },
  { id: 'KOCEVJE', title: 'Kočevje', altitudeM: 467, latitude: 45.6458, longitude: 14.8496 },
  { id: 'KOPER_KAPET-IJA', title: 'Koper Kapitanija', altitudeM: 4, latitude: 45.5481, longitude: 13.7246 },
  { id: 'KOPER_MARKOVEC', title: 'Koper Markovec', altitudeM: 56, latitude: 45.543, longitude: 13.7135 },
  { id: 'KOREN-SED', title: 'Korensko sedlo', altitudeM: 1072, latitude: 46.5167, longitude: 13.7517 },
  { id: 'GORICKO_KRAJI-PAR', title: 'Krajinski park Goričko', altitudeM: 415, latitude: 46.8359, longitude: 16.0307 },
  { id: 'KRANJ', title: 'Kranj', altitudeM: 403, latitude: 46.2477, longitude: 14.3647 },
  { id: 'KREDA-ICA', title: 'Kredarica', altitudeM: 2514, latitude: 46.3787, longitude: 13.8489 },
  { id: 'KRN', title: 'Krn', altitudeM: 918, latitude: 46.238, longitude: 13.658 },
  { id: 'KRSKO_NEK', title: 'Krško', altitudeM: 156, latitude: 45.9399, longitude: 15.5131 },
  { id: 'KRVAVEC', title: 'Krvavec', altitudeM: 1740, latitude: 46.2973, longitude: 14.5333 },
  { id: 'KUBED', title: 'Kubed', altitudeM: 234, latitude: 45.52, longitude: 13.8689 },
  { id: 'KUM', title: 'Kum', altitudeM: 1211, latitude: 46.0879, longitude: 15.0732 },
  { id: 'LENDAVA', title: 'Lendava', altitudeM: 159, latitude: 46.5526, longitude: 16.4579 },
  { id: 'CERKLJE_LETAL-SCE', title: 'Letališče Cerklje ob Krki', altitudeM: 154, latitude: 45.901, longitude: 15.5161 },
  { id: 'MARIBOR_SLIVNICA', title: 'Letališče Edvarda Rusjana Maribor', altitudeM: 264, latitude: 46.4797, longitude: 15.6821 },
  { id: 'LJUBL-ANA_BRNIK', title: 'Letališče Jožeta Pučnika Ljubljana', altitudeM: 364, latitude: 46.2114, longitude: 14.4784 },
  { id: 'LESCE', title: 'Letališče Lesce', altitudeM: 509, latitude: 46.362, longitude: 14.1718 },
  { id: 'PORTOROZ_SECOVLJE', title: 'Letališče Portorož', altitudeM: 2, latitude: 45.4753, longitude: 13.616 },
  { id: 'LISCA', title: 'Lisca', altitudeM: 947, latitude: 46.0678, longitude: 15.2849 },
  { id: 'LITIJA_GRBIN', title: 'Litija', altitudeM: 272, latitude: 46.0651, longitude: 14.8185 },
  { id: 'LJUBL-ANA_BEZIGRAD', title: 'Ljubljana', altitudeM: 299, latitude: 46.0655, longitude: 14.5124 },
  { id: 'LJUBL-ANA_VIC', title: 'Ljubljana - Vič', altitudeM: 293, latitude: 46.0375, longitude: 14.4893 },
  { id: 'LOGAR-DOL', title: 'Logarska dolina', altitudeM: 776, latitude: 46.3936, longitude: 14.6311 },
  { id: 'LOGATEC', title: 'Logatec', altitudeM: 486, latitude: 45.9077, longitude: 14.2032 },
  { id: 'KOPER_LUKA', title: 'Luka Koper', altitudeM: -2, latitude: 45.5645, longitude: 13.7448 },
  { id: 'MALKOVEC', title: 'Malkovec', altitudeM: 400, latitude: 45.9531, longitude: 15.2049 },
  { id: 'MARIBOR_VRBAN-PLA', title: 'Maribor', altitudeM: 279, latitude: 46.5678, longitude: 15.626 },
  { id: 'MARIN-VAS', title: 'Marinča vas', altitudeM: 272, latitude: 45.8719, longitude: 14.8178 },
  { id: 'METLIKA', title: 'Metlika', altitudeM: 210, latitude: 45.6442, longitude: 15.3201 },
  { id: 'MEZICA', title: 'Mežica', altitudeM: 469, latitude: 46.5296, longitude: 14.8596 },
  { id: 'MIKLAVZ_NA-GOR', title: 'Miklavž na Gorjancih', altitudeM: 959, latitude: 45.775, longitude: 15.3199 },
  { id: 'MURSK-SOB', title: 'Murska Sobota', altitudeM: 188, latitude: 46.6521, longitude: 16.1913 },
  { id: 'NANOS', title: 'Nanos', altitudeM: 1242, latitude: 45.7714, longitude: 14.0536 },
  { id: 'NOVA-GOR', title: 'Nova Gorica', altitudeM: 113, latitude: 45.9556, longitude: 13.6524 },
  { id: 'NOVA-VAS_BLOKE', title: 'Nova vas - Bloke', altitudeM: 718, latitude: 45.7689, longitude: 14.5088 },
  { id: 'NOVO-MES', title: 'Novo mesto', altitudeM: 220, latitude: 45.8018, longitude: 15.1773 },
  { id: 'OSILNICA', title: 'Osilnica', altitudeM: 331, latitude: 45.5314, longitude: 14.6915 },
  { id: 'OTLICA', title: 'Otlica', altitudeM: 965, latitude: 45.9377, longitude: 13.9116 },
  { id: 'SKOCJAN', title: 'Park Škocjanske jame', altitudeM: 420, latitude: 45.6638, longitude: 13.9931 },
  { id: 'PASJA-RAV', title: 'Pasja ravan', altitudeM: 1019, latitude: 46.0979, longitude: 14.2282 },
  { id: 'PAVLI-SED', title: 'Pavličevo sedlo', altitudeM: 1337, latitude: 46.4251, longitude: 14.5853 },
  { id: 'PIRAN_OCEAN-BOJ', title: 'Piran - oceanografska boja', altitudeM: 0, latitude: 45.5481, longitude: 13.5454 },
  { id: 'PLANI-POD', title: 'Planina pod Golico', altitudeM: 957, latitude: 46.4672, longitude: 14.0525 },
  { id: 'PODCE-TEK_ATOMS-TOP', title: 'Podčetrtek', altitudeM: 202, latitude: 46.1547, longitude: 15.6083 },
  { id: 'PODNANOS', title: 'Podnanos', altitudeM: 153, latitude: 45.8045, longitude: 13.9659 },
  { id: 'POSTOJNA', title: 'Postojna', altitudeM: 538, latitude: 45.7722, longitude: 14.1973 },
  { id: 'PREDEL', title: 'Predel', altitudeM: 1155, latitude: 46.4183, longitude: 13.5784 },
  { id: 'PTUJ', title: 'Ptuj', altitudeM: 222, latitude: 46.4197, longitude: 15.8492 },
  { id: 'RADEG-NDA', title: 'Radegunda', altitudeM: 794, latitude: 46.3661, longitude: 14.933 },
  { id: 'RATECE', title: 'Rateče', altitudeM: 864, latitude: 46.4971, longitude: 13.7129 },
  { id: 'RATIT-VEC', title: 'Ratitovec', altitudeM: 1639, latitude: 46.2362, longitude: 14.0902 },
  { id: 'RAVNE_NA-KOR', title: 'Ravne na Koroškem', altitudeM: 396, latitude: 46.5477, longitude: 14.94 },
  { id: 'ROGAS-SLA', title: 'Rogaška Slatina', altitudeM: 288, latitude: 46.2409, longitude: 15.6439 },
  { id: 'ROGLA', title: 'Rogla', altitudeM: 1495, latitude: 46.453, longitude: 15.3315 },
  { id: 'RUDNO-POL', title: 'Rudno polje', altitudeM: 1344, latitude: 46.3463, longitude: 13.9235 },
  { id: 'SEVNO', title: 'Sevno', altitudeM: 556, latitude: 45.9821, longitude: 14.9236 },
  { id: 'SLAVNIK', title: 'Slavnik', altitudeM: 1020, latitude: 45.5336, longitude: 13.976 },
  { id: 'SLOVE-KON', title: 'Slovenske Konjice', altitudeM: 328, latitude: 46.3433, longitude: 15.4367 },
  { id: 'TRIJE-KRA_NA-POH', title: 'Sveti Trije Kralji na Pohorju', altitudeM: 1230, latitude: 46.4399, longitude: 15.4567 },
  { id: 'SVISCAKI', title: 'Sviščaki', altitudeM: 1302, latitude: 45.5756, longitude: 14.3988 },
  { id: 'SEBRE-VRH', title: 'Šebreljski vrh', altitudeM: 1066, latitude: 46.0629, longitude: 13.9113 },
  { id: 'SLOVE-GRA', title: 'Šmartno pri Slovenj Gradcu', altitudeM: 455, latitude: 46.4896, longitude: 15.1112 },
  { id: 'TATRE', title: 'Tatre', altitudeM: 748, latitude: 45.5989, longitude: 14.0875 },
  { id: 'TOLMIN_VOLCE', title: 'Tolmin - Volče', altitudeM: 187, latitude: 46.1777, longitude: 13.718 },
  { id: 'TOPOL', title: 'Topol', altitudeM: 695, latitude: 46.0941, longitude: 14.3713 },
  { id: 'TRBOVLJE', title: 'Trbovlje', altitudeM: 284, latitude: 46.1575, longitude: 15.0539 },
  { id: 'TREBNJE', title: 'Trebnje', altitudeM: 277, latitude: 45.911, longitude: 15.0072 },
  { id: 'TROJANE_LIMOVCE', title: 'Trojane - Limovce', altitudeM: 673, latitude: 46.1984, longitude: 14.9113 },
  { id: 'TRZAS-ZAL', title: 'Tržaški zaliv (Zarja)', altitudeM: 0, latitude: 45.6016, longitude: 13.5352 },
  { id: 'URSLJ-GOR', title: 'Uršlja gora', altitudeM: 1696, latitude: 46.4849, longitude: 14.9634 },
  { id: 'VEDRIJAN', title: 'Vedrijan', altitudeM: 231, latitude: 46.0131, longitude: 13.541 },
  { id: 'VELENJE', title: 'Velenje', altitudeM: 410, latitude: 46.3603, longitude: 15.1119 },
  { id: 'VELIK-LAS', title: 'Velike Lašče', altitudeM: 528, latitude: 45.831, longitude: 14.6427 },
  { id: 'VOGEL', title: 'Vogel', altitudeM: 1515, latitude: 46.2594, longitude: 13.8396 },
  { id: 'VRHNIKA', title: 'Vrhnika', altitudeM: 310, latitude: 45.966, longitude: 14.2717 },
  { id: 'VRSIC', title: 'Vršič', altitudeM: 1684, latitude: 46.4328, longitude: 13.7478 },
  { id: 'ZADLOG', title: 'Zadlog', altitudeM: 716, latitude: 45.9395, longitude: 14.0023 },
  { id: 'ZELENICA', title: 'Zelenica', altitudeM: 1534, latitude: 46.4289, longitude: 14.233 },
  { id: 'ZGORN-RAD', title: 'Zgornja Radovna', altitudeM: 777, latitude: 46.424, longitude: 13.9352 },
  { id: 'ZGORN-SOR', title: 'Zgornja Sorica', altitudeM: 846, latitude: 46.2221, longitude: 14.0286 },
];

/**
 * Zlije zapisani imenik z živim posnetkom cikla.
 *
 * Živi vir ima PREDNOST pri vsebini (ime, višina, koordinati se lahko popravijo), zapisani
 * imenik pa skrbi za POKRITOST (postaja, ki v tem ciklu ni objavila, vseeno ostane v ponudbi).
 * Rezultat je urejen po imenu po slovensko — seznam je namenjen iskanju s pogledom.
 */
export function mergeStationCatalog(
  catalog: readonly ArsoStation[],
  live: readonly ArsoStation[],
): ArsoStation[] {
  const merged = new Map<string, ArsoStation>();
  for (const station of catalog) merged.set(station.id, station);
  for (const station of live) merged.set(station.id, station);
  return [...merged.values()].sort((a, b) => a.title.localeCompare(b.title, 'sl'));
}
