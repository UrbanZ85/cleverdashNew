// Pomanjšava slike v brskalniku (specs/013-recipes/research.md §5).
//
// Zakaj TU in ne na strežniku: `sharp` bi bil običajen odgovor, a je izvorni gradnik (`node-gyp`,
// prevajanje ob namestitvi, drugačen paket za `linux/arm64` in `linux/amd64`) — v tem vsebniku je
// to strošek, ki ga ena pomanjšana slika ne opraviči. Brskalnik ima `<canvas>` in ga ima že.
//
// Kar iz tega sledi in je uveljavljeno na STREŽNIKU, ne tukaj: pomanjšava je za strežnik
// NEPREVERJEN VNOS in gre skozi isto preverbo podpisa datoteke in velikosti kot izvirnik. Ta
// datoteka je udobje, ne varovalo — kdor pošlje svojo "pomanjšavo" mimo tega vmesnika, ne pride
// dlje od tistega, kar dovoli `checkImageUpload`.
//
// Neuspeh tu NI usoden: izvirnik je že naložen in seznam ga bo postregel, samo večjega. Zato vse
// funkcije vrnejo `null` namesto da bi vrgle.

/** Daljša stranica pomanjšave. 600 px pokrije naslovno sliko v seznamu tudi na zaslonu z dvojno
 * gostoto, hkrati pa je JPEG te velikosti daleč pod mejo `RECIPES_THUMB_MAX_KB`. */
const THUMB_MAX_EDGE = 600;

/** Kakovost JPEG. 0.75 je meja, pod katero se na fotografiji hrane začnejo videti robovi stiskanja
 * — pri sliki, ki je namenjena seznamu, je to še vedno v redu, a rezerve ni veliko. */
const THUMB_QUALITY = 0.75;

export interface Measured {
  width: number;
  height: number;
}

/**
 * Mere slike, ne da bi jo dekodirali dvakrat.
 *
 * Merimo v brskalniku in NE na strežniku, ker bi strežnik za to potreboval dekodirnik slik —
 * odvisnost zaradi razmerja stranic. `null` pomeni "ne vemo" in je veljavno stanje: strežnik obe
 * meri hrani kot neobvezni.
 */
export async function measureImage(file: Blob): Promise<Measured | null> {
  const bitmap = await decode(file);
  if (!bitmap) return null;
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close?.();
  return size;
}

/**
 * Pomanjšava kot JPEG, ali `null`, kadar je ni bilo mogoče narediti.
 *
 * JPEG in ne izvirna vrsta: PNG fotografije je pogosto VEČJI od izvirnega JPEG, kar bi pomenilo
 * "pomanjšavo", ki je večja od slike, ki jo nadomešča. Prozornosti pri fotografiji jedi ni, zato
 * je izguba alfa kanala tu brez posledic.
 *
 * Slika, ki je že manjša od meje, se NE pomanjšuje — nastala bi kopija enake velikosti, ki bi
 * podvojila prostor brez koristi. V tem primeru vrne `null` in seznam postreže izvirnik.
 */
export async function makeThumbnail(file: Blob): Promise<Blob | null> {
  const bitmap = await decode(file);
  if (!bitmap) return null;

  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= THUMB_MAX_EDGE) return null;

    const scale = THUMB_MAX_EDGE / longest;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) return null;
    // `drawImage` z ciljnimi merami pomanjša v enem koraku. Za seznam to zadošča; večstopenjsko
    // pomanjševanje bi dalo nekoliko mehkejši rezultat, a za sliko širine 600 px razlike ni videti.
    context.drawImage(bitmap, 0, 0, width, height);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', THUMB_QUALITY);
    });
  } finally {
    bitmap.close?.();
  }
}

/**
 * `createImageBitmap` je hiter in ne potrebuje DOM, a ga starejši brskalniki nimajo; takrat pade
 * na `<img>` z `objectURL`.
 *
 * `objectURL` se sprosti v `finally` — brez tega bi vsaka naložena slika pustila zadržan pomnilnik
 * do osvežitve strani.
 */
type DecodedImage = CanvasImageSource & { width: number; height: number; close?: () => void };

async function decode(file: Blob): Promise<DecodedImage | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Pokvarjena ali nepodprta slika — poskusimo še prek `<img>`, sicer obupamo.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
