// Priprava slike PRED nalaganjem: pomanjšava in pretvorba v WebP.
//
// Zakaj v brskalniku in ne na strežniku: `sharp` bi bil običajen odgovor, a je izvorni gradnik
// (`node-gyp`, prevajanje ob namestitvi, drugačen paket za `linux/arm64` in `linux/amd64`) — v tem
// vsebniku strošek, ki ga stiskanje slik ne opraviči. Brskalnik ima `<canvas>` in ga ima že.
//
// KAJ TO PRIHRANI. Fotografija s telefona je 4–6 MB pri 4000 px. Recept je ne potrebuje: prikaže se
// največ čez širino zaslona. Po pomanjšavi na 1600 px in stiskanju v WebP je ista slika 150–350 kB —
// torej približno **petnajstkrat manjša**, brez vidne razlike na zaslonu. Pri sto receptih s po
// tremi slikami je to razlika med ~1,5 GB in ~100 MB v bazi.
//
// KAJ JE PRI TEM NEVARNO in kar ta datoteka uveljavlja:
//
//  1. **`toBlob` z nepodprto vrsto NE javi napake — tiho vrne PNG.** Pri fotografiji je PNG lahko
//     večji od izvirnega JPEG, torej bi "optimizacija" sliko napihnila. Zato se vrsta nastalega
//     bloba VEDNO preveri (`blob.type`) in ne domneva.
//  2. **Risanje na `<canvas>` odvrže EXIF.** Fotografija s telefona je pogosto zapisana ležeče z
//     zastavico za zasuk; brez `imageOrientation: 'from-image'` bi se po pretvorbi prikazala
//     obrnjena. To je napaka, ki se pokaže šele pri pravi fotografiji, ne pri testni sliki.
//  3. **Rezultat je lahko VEČJI od izvirnika** (majhna, že stisnjena slika). Takrat se naloži
//     izvirnik — optimizacija, ki poslabša, ni optimizacija.
//
// Strežnik na to ne računa: vrsto še vedno ugotovi iz podpisa datoteke in velikost omeji sam
// (`domain/image-type.ts`). Ta datoteka je stiskanje, ne varovalo — slika, naložena mimo vmesnika
// (n8n prek API-ja), gre v bazo taka, kot je bila poslana.

/** Daljša stranica shranjene slike. 1600 px pokrije celozaslonski prikaz tudi na zaslonu z dvojno
 * gostoto; nad tem se pri receptu ne vidi ničesar več, plača pa se s prostorom. */
const FULL_MAX_EDGE = 1600;

/** Daljša stranica pomanjšave za seznam. */
const THUMB_MAX_EDGE = 600;

/** Kakovost stiskanja. 0.82 je pri WebP meja, pod katero se na fotografiji hrane začnejo videti
 * robovi stiskanja; pomanjšava v seznamu prenese manj, ker je izrisana majhna. */
const FULL_QUALITY = 0.82;
const THUMB_QUALITY = 0.7;

export interface PreparedImage {
  /** Kar se naloži kot slika recepta — pomanjšana in stisnjena, ali izvirnik, kadar je bil manjši. */
  full: Blob;
  /** Pomanjšava za seznam, ali `null`, kadar je slika že tako majhna, da bi bila kopija. */
  thumb: Blob | null;
  /** Meri SHRANJENE slike (`full`), ne izvirnika — v zapis gre tisto, kar je v njem. */
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * Mere po pomanjšavi, tako da daljša stranica ne preseže `maxEdge`.
 *
 * NIKOLI ne poveča: slika, manjša od meje, ostane svoje velikosti. Povečava ne doda podatka, poveča
 * pa datoteko — natanko obratno od namena.
 *
 * Čista funkcija in zato edini del te datoteke, ki ga pokrivajo enotski testi: `<canvas>` v jsdom
 * ne zna kodirati, razmerje stranic pa je tisto, kar se da pokvariti tiho.
 */
export function fitWithin(size: Size, maxEdge: number): Size {
  const longest = Math.max(size.width, size.height);
  if (longest <= maxEdge || longest === 0) return { width: size.width, height: size.height };

  const scale = maxEdge / longest;
  return {
    // Najmanj 1 px: pri zelo podolgovati sliki bi zaokroževanje dalo 0 in `<canvas>` s širino 0 vrže.
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

/**
 * Ali se splača uporabiti pretvorjeno sliko namesto izvirnika.
 *
 * Kadar pomanjšave ni bilo (slika je bila že dovolj majhna) in je pretvorjena VEČJA, je izvirnik
 * boljši — to se zgodi pri majhnih, že dobro stisnjenih JPEG-ih. Kadar je bila slika pomanjšana, se
 * pretvorjena uporabi tudi, če je večja: takrat gre za sliko, ki je bila prevelika za prikaz, in
 * mere so pomembnejše od bajtov.
 */
export function shouldUseEncoded(params: {
  originalBytes: number;
  encodedBytes: number;
  resized: boolean;
}): boolean {
  return params.resized || params.encodedBytes < params.originalBytes;
}

type DecodedImage = CanvasImageSource & { width: number; height: number; close?: () => void };

/**
 * Pripravi sliko za nalaganje. `null` pomeni, da je ni bilo mogoče dekodirati — klicatelj naj takrat
 * naloži izvirnik, ker je sliko morda mogoče prikazati, čeprav je brskalnik ni znal odpreti v
 * `<canvas>`.
 */
export async function prepareImage(file: Blob): Promise<PreparedImage | null> {
  const bitmap = await decode(file);
  if (!bitmap) return null;

  try {
    const source: Size = { width: bitmap.width, height: bitmap.height };
    if (source.width === 0 || source.height === 0) return null;

    const target = fitWithin(source, FULL_MAX_EDGE);
    const resized = target.width !== source.width || target.height !== source.height;

    const encoded = await draw(bitmap, target, FULL_QUALITY);
    const full =
      encoded && shouldUseEncoded({ originalBytes: file.size, encodedBytes: encoded.size, resized })
        ? encoded
        : file;

    // Mere se ujemajo s tem, kar je v `full`: kadar je obveljal izvirnik, so to mere izvirnika.
    const size = full === file ? source : target;

    const thumbTarget = fitWithin(size, THUMB_MAX_EDGE);
    // Kadar je slika že manjša od pomanjšave, pomanjšave NI — kopija enake velikosti bi podvojila
    // prostor brez koristi. Seznam takrat postreže `full` (strežnik to zna, glej pot z `variant`).
    const thumb =
      thumbTarget.width === size.width && thumbTarget.height === size.height
        ? null
        : await draw(bitmap, thumbTarget, THUMB_QUALITY);

    return { full, thumb, width: size.width, height: size.height };
  } finally {
    bitmap.close?.();
  }
}

/**
 * Izriše sliko v dane mere in jo zakodira — WebP, kadar ga brskalnik zna, sicer JPEG.
 *
 * Preverba `blob.type` je BISTVENA in ne previdnost: `toBlob` z nepodprto vrsto ne javi napake,
 * ampak tiho vrne PNG. Pri fotografiji je ta lahko večji od izvirnika.
 */
async function draw(source: DecodedImage, size: Size, quality: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;

  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(source, 0, 0, size.width, size.height);

  const webp = await toBlob(canvas, 'image/webp', quality);
  if (webp && webp.type === 'image/webp') return webp;

  // Safari pred 16.4 in starejši brskalniki WebP ne zakodirajo. JPEG je tam pravi nadomestek —
  // PNG, ki bi ga `toBlob` vrnil sam od sebe, pri fotografiji ni.
  const jpeg = await toBlob(canvas, 'image/jpeg', quality);
  return jpeg && jpeg.type === 'image/jpeg' ? jpeg : null;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    // `toBlob` v jsdom ne obstaja; klicatelj (prepareImage) se v tem primeru obnese kot ob
    // nedekodirani sliki in naloži izvirnik.
    if (typeof canvas.toBlob !== 'function') {
      resolve(null);
      return;
    }
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * `createImageBitmap` je hiter in ne potrebuje DOM; starejši brskalniki ga nimajo in takrat pade na
 * `<img>` z `objectURL`.
 *
 * `imageOrientation: 'from-image'` je OBVEZEN: risanje na `<canvas>` odvrže EXIF, zato bi se
 * fotografija s telefona, zapisana ležeče z zastavico za zasuk, po pretvorbi prikazala obrnjena.
 * Pri poti prek `<img>` zasuk uveljavi brskalnik sam (`image-orientation: from-image` je privzeto).
 *
 * `objectURL` se sprosti v `finally` — brez tega bi vsaka naložena slika zadržala pomnilnik do
 * osvežitve strani.
 */
async function decode(file: Blob): Promise<DecodedImage | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Pokvarjena slika, nepodprta vrsta ali brskalnik brez te možnosti — poskusimo še prek `<img>`.
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
