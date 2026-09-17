// Čista domenska plast modula (člen IX): brez baze, brez omrežja, brez express.
//
// FR-021, research.md §6. Vrsta slike se ugotovi iz VSEBINE — iz podpisa datoteke — in nikoli iz
// glave `Content-Type` ali končnice imena. Oboje pošlje odjemalec in je zato IZJAVA, ne dejstvo.
//
// Razlog ni teoretičen. Slika se postreže nazaj z vrsto, ki je v zapisu. Dokument HTML, ki bi se
// uspešno naložil kot "slika" in se pozneje postregel kot `text/html` z NAŠE domene, je shranjen
// XSS — z dostopom do seje vsakega, ki tako "sliko" odpre. Zato se v zapis shrani izključno
// vrsta, ugotovljena tukaj.

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/** Toliko bajtov zadošča za vsak podpis spodaj — WebP potrebuje največ (12). */
const SIGNATURE_BYTES = 12;

/**
 * Vrsta slike iz podpisa datoteke, ali `null`, kadar vsebina ni nobena od dovoljenih.
 *
 * Podpisi:
 *  - JPEG: `FF D8 FF`
 *  - PNG:  `89 50 4E 47 0D 0A 1A 0A` — cela osmerica, ne le `89 PNG`: zadnji štirje bajti so
 *    prav tisti, ki ujamejo pokvarjen prenos iz besedilnega načina (CRLF, ki bi ga prepis
 *    zamenjal), in so del standarda natanko zato.
 *  - WebP: `RIFF` + 4 bajti dolžine + `WEBP`. Dolžina se NE preverja, ker je vrednost iz
 *    datoteke — preverjamo, da je ovoj RIFF in da je vsebina WEBP, kar je vse, kar podpis pove.
 */
export function sniffImageMimeType(buffer: Buffer): AllowedImageMimeType | null {
  if (buffer.length < SIGNATURE_BYTES) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }

  return null;
}

/**
 * Ime datoteke, varno za glavo `Content-Disposition`.
 *
 * Uporabnikovo ime datoteke gre v glavo odgovora. Narekovaj, podpičje in prelom vrstice v njej
 * so vbrizg v glavo, zato se obdrži izključno ozek nabor znakov. Prazen rezultat pade na
 * nadomestno ime — glava brez imena je slabša od glave z nevtralnim imenom.
 */
export function safeImageFileName(raw: string | null | undefined, mimeType: string): string {
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  // Nedovoljeni znaki se zamenjajo s PRESLEDKOM in ne izbrišejo: brisanje bi `a"; drop\r\nX: y`
  // zlepilo v `a dropX y` — varno, a nerazpoznavno. S presledkom in strnitvijo ostane `a drop X y`,
  // kar je še vedno brez znakov, ki bi bili vbrizg v glavo, in je človeku še vedno ime.
  const base = (raw ?? '')
    .replace(/\.[^.]*$/, '')
    .replace(/[^A-Za-z0-9 ._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim();
  return base.length > 0 ? `${base}.${extension}` : `slika.${extension}`;
}

export type ImageRejection = 'empty' | 'too-large' | 'unsupported';

export interface ImageCheckResult {
  ok: boolean;
  reason?: ImageRejection;
  message?: string;
  mimeType?: AllowedImageMimeType;
}

/**
 * Vsa preverjanja ene naložene slike na enem mestu: prazno telo, velikost, vrsta.
 *
 * Kliče se DVAKRAT za eno nalaganje — enkrat za izvirnik in enkrat za pomanjšavo, ki jo pošlje
 * odjemalec (research.md §5). Pomanjšava je prav tako nepreverjen vnos in gre zato skozi isto
 * preverbo, samo z nižjo mejo: brez tega bi bila `thumb` odprta vrata za vse, kar `data` ne
 * dovoli.
 */
export function checkImageUpload(buffer: Buffer, maxBytes: number): ImageCheckResult {
  if (buffer.length === 0) {
    return { ok: false, reason: 'empty', message: 'Telo zahteve je prazno — slike ni.' };
  }
  if (buffer.length > maxBytes) {
    return {
      ok: false,
      reason: 'too-large',
      message: `Slika je prevelika (${Math.round(buffer.length / 1024 / 1024)} MB). Največ ${Math.round(maxBytes / 1024 / 1024)} MB.`,
    };
  }
  const mimeType = sniffImageMimeType(buffer);
  if (!mimeType) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'Vsebina ni slika JPEG, PNG ali WebP. Vrsto ugotovimo iz same datoteke, ne iz njenega imena.',
    };
  }
  return { ok: true, mimeType };
}
