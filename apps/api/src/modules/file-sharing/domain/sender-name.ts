// FR-092: kdo je datoteko oddal, je NIZ, KI GA JE VPISAL TUJEC.
//
// Lastnik ga bere na svojem seznamu, zato je edino, kar o pošiljatelju sistem sploh ve — in
// hkrati edini prosto oblikovan vnos, ki v tej namestitvi pride od nekoga brez računa. Čiščenje
// je zato obvezno, in sicer po istih dveh razlogih kot pri imenu datoteke (file-name.ts):
//
//  1. znak za novo vrstico v nizu, ki gre v dnevnik ali v glavo odgovora, je vbrizg;
//  2. nevidni znaki naredijo niz, ki je videti prazen, a ni — na seznamu bi bila vrstica brez
//     pojasnila, od kod je datoteka.
//
// Kar tu NAMENOMA NI: preverjanje, ali je navedba resnična. Pošiljatelj lahko napiše, kar hoče,
// zato jo vmesnik predstavi kot NAVEDBO pošiljatelja in ne kot ugotovljeno istovetnost.
//
// Člen IX: čista funkcija, brez baze, omrežja in datotečnega sistema.

const MAX_LENGTH = 80;

/** Krmilni in nevidni znaki — isti nabor kot v `file-name.ts`. */
// eslint-disable-next-line no-control-regex -- krmilni znaki so natanko tisto, kar ta izraz lovi
const INVISIBLE = /[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g;

/**
 * Vrne očiščeno navedbo pošiljatelja ali `null`.
 *
 * `null` in ne prazen niz: polje je neobvezno, in vnos, od katerega ne ostane nič, mora biti
 * neločljiv od izpuščenega polja — sicer bi zapis nosil razliko, ki v vmesniku ni izrazljiva.
 */
export function sanitizeSenderName(raw: unknown): string | null {
  const cleaned = String(raw ?? '')
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}
