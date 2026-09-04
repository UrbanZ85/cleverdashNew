// Prepis govora na strežniku pomeni, da posnetek uporabnikovega glasu ZAPUSTI ta strežnik in
// odide k zunanjemu ponudniku. Zato ima dvojno ključavnico in ta datoteka je njeno edino
// mesto odločanja — čista funkcija, testabilna brez omrežja in brez baze (člen IX):
//
//  1. `NOTES_TRANSCRIPTION_API_KEY` + `NOTES_TRANSCRIPTION_URL` v okolju — brez njiju
//     strežnik te poti fizično nima (člen IV: skrivnosti samo iz okolja);
//  2. osebna nastavitev `notes.serverTranscription` v profilu — privzeto IZKLOPLJENA.
//
// Zahteva uporabnika je bila izrecna: "za pošiljanje whisperju je potrebna nastavitev, tudi v
// UI, kljub temu da imam v env ključ". Prisotnost ključa je torej DOVOLJENJE NAMESTITVE, ne
// privolitev osebe — narekovanje v brskalniku (Web Speech API) deluje neodvisno od obojega.

export type TranscriptionBlockReason = 'not-configured' | 'not-enabled';

export interface TranscriptionAvailability {
  /** Ali je zunanja storitev nastavljena v okolju te namestitve. */
  configured: boolean;
  /** Ali je uporabnik pošiljanje posnetkov ven izrecno dovolil v svojih nastavitvah. */
  enabled: boolean;
}

/** Vrne `null`, kadar je prepis dovoljen; sicer razlog, ZAKAJ ne — vmesnik iz njega sestavi
 * sporočilo, ki pove, kaj mora uporabnik narediti (vklopiti stikalo) in kaj skrbnik
 * (nastaviti ključ). Eno samo "ni na voljo" bi bilo za oba neuporabno. */
export function transcriptionBlockReason(availability: TranscriptionAvailability): TranscriptionBlockReason | null {
  if (!availability.configured) return 'not-configured';
  if (!availability.enabled) return 'not-enabled';
  return null;
}

export function describeTranscriptionBlock(reason: TranscriptionBlockReason): string {
  return reason === 'not-configured'
    ? 'Prepis na strežniku v tej namestitvi ni nastavljen (manjka NOTES_TRANSCRIPTION_URL ali NOTES_TRANSCRIPTION_API_KEY).'
    : 'Prepis na strežniku ni vklopljen v tvojih nastavitvah. Vklopi ga v Nastavitve → Moduli → Beležke.';
}

/** Ime datoteke za multipart zahtevo. Storitve za prepis (OpenAI Whisper in združljive)
 * obliko posnetka ugotovijo iz PRIPONE imena datoteke, ne iz vrste vsebine — z napačno
 * pripono zavrnejo posnetek, ki bi ga sicer razumele. */
export function audioFileName(mimeType: string): string {
  const extensions: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/aac': 'aac',
  };
  return `posnetek.${extensions[mimeType] ?? 'webm'}`;
}
