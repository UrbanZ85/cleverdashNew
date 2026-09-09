import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md "Settings" (004): NE VEČ singleton — ena vrstica na uporabnika (FR-009/FR-010).
// `_id: 'singleton'` je odpravljen; `userId` je edinstven, en dokument na uporabnika.

const tileLayoutEntrySchema = new Schema(
  {
    type: { type: String, required: true },
    position: { type: Number, required: true },
    visible: { type: Boolean, default: true },
    config: { type: Schema.Types.Mixed, default: undefined },
  },
  { _id: false },
);

const settingsSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    weather: {
      locationName: { type: String, default: 'Ljubljana' },
      latitude: { type: Number, default: 46.0629 },
      longitude: { type: Number, default: 14.5602 },
    },
    theme: { type: String, enum: ['system', 'light', 'dark'], default: 'system' },
    // 005: osebna prepisa naslovov zunanjih virov. Prazno/`null` pomeni "uporabi sistemski
    // privzetek iz .env" — strežnik razreši `sources.* ?? env.*` (modules/dashboard/router.ts).
    // Vrednosti v .env s tem ne izginejo: ostanejo PRIVZETEK, da namestitev deluje takoj.
    sources: {
      weatherUrl: { type: String, default: null },
      radarUrl: { type: String, default: null },
      webcamBaseUrl: { type: String, default: null },
    },
    tiles: { type: [tileLayoutEntrySchema], default: [] },
    // Record<tabId, {enabled?, order?}> — Mixed, ker so ključi dinamični (imena zavihkov).
    tabs: { type: Schema.Types.Mixed, default: {} },
    // 003, data-model.md "Nastavitve porabe podatkov", Story 7: privzeto vklopljeno.
    cameraDataSaverEnabled: { type: Boolean, default: true },
    // Ploščica "Pot": DVA KRAJA, ne dva naslova zemljevidov. Iz njiju strežnik izpelje oboje
    // — čas poti prek Routes API (domain/commute-route.ts) in naslov vdelanega zemljevida
    // (domain/map-embed.ts) — za obe smeri, ker je pot domov ista pot v nasprotni smeri.
    // Shranjena naslova zemljevidov bi to zvezo pretrgala: iz njiju ni mogoče izračunati
    // časa poti, ker v njih ni krajev, samo slika.
    //
    // Naslov ALI koordinati (glej `isPlaceUsable`): koordinati sta natančnejši in cenejši
    // (Googlu ni treba geokodirati), naslov pa je tisto, kar človek zna napisati na pamet.
    commute: {
      // Videz ploščice je uporabnikova izbira, ne konstanta v kodi: koliko zemljevida kdo
      // potrebuje in ali ima na nadzorni plošči prostor za dva drug ob drugem, je odvisno od
      // zaslona. Privzetka sta konservativna — ploščica velikosti ostalih.
      mapHeightPx: { type: Number, default: 170, min: 100, max: 600 },
      layout: { type: String, enum: ['vertical', 'horizontal'], default: 'vertical' },
      home: {
        label: { type: String, default: 'Doma', maxlength: 40 },
        address: { type: String, default: null, maxlength: 200 },
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null },
      },
      work: {
        label: { type: String, default: 'Služba', maxlength: 40 },
        address: { type: String, default: null, maxlength: 200 },
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null },
      },
    },
    // 007 (beležke): privolitev, da zvočni posnetek zapusti ta strežnik in gre k zunanji
    // storitvi za prepis. PRIVZETO IZKLOPLJENO in neodvisno od tega, ali je ključ nastavljen
    // v okolju — ključ je dovoljenje namestitve, to stikalo pa privolitev osebe, katere glas
    // je na posnetku (modules/notes/domain/transcription-gate.ts).
    notes: {
      serverTranscription: { type: Boolean, default: false },
    },
    // 011 (meritve ARSO postaje): oznaka izbrane samodejne postaje (`domain/arso-station.ts`),
    // npr. `VRHNIKA`. `null` pomeni "nisem izbral" in NE "izklopljeno" — strežnik takrat vrne
    // privzetek namestitve (`platform/settings/meteo.service.ts`), da zavihek ni prazen, dokler
    // si človek postaje ne izbere.
    //
    // Shrani se SAMO oznaka, ne ime in ne koordinati postaje: ime pride z istim ARSO virom kot
    // meritve, in dva vira resnice za "kako se postaja imenuje" bi se razšla ob prvem, ko ARSO
    // ime popravi.
    // 011 razširitev: postaj je VEČ in vsaka pove, čigava je — `arso:VRHNIKA`,
    // `neverin:sveta-marina` (`domain/meteo-station-ref.ts`). Zavihek med njimi preklaplja,
    // ploščica na nadzorni plošči kaže PRVO.
    //
    // `station` (ednina) je ostanek časa, ko je bil ponudnik en sam in oznaka gola
    // (`VRHNIKA`). Polje se OHRANI in ne izbriše: dokumenti s to obliko so v bazi in selitev
    // ob branju je cenejša ter varnejša od enkratnega prepisa vseh dokumentov, ki mora
    // uspeti. Bere se samo, kadar je `stations` prazen (glej `platform/settings/meteo.service.ts`),
    // piše pa se ob vsakem shranjevanju seznama, da starejši odjemalec ne obtiči na
    // prejšnji postaji.
    meteo: {
      station: { type: String, default: null },
      stations: { type: [String], default: [] },
    },
    updatedAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);

export type SettingsDoc = InferSchemaType<typeof settingsSchema>;
export const SettingsModel = model('Settings', settingsSchema);

export interface TabOverride {
  enabled?: boolean;
  order?: number;
}

/** Vrne nastavitve tega uporabnika, ustvari jih z privzetki, če še ne obstajajo
 * (FR-009 — ob prvi prijavi samodejno dobi delujočo aplikacijo). */
export async function getOrCreateSettingsForUser(userId: string): Promise<InstanceType<typeof SettingsModel>> {
  const existing = await SettingsModel.findOne({ userId });
  if (existing) return existing;
  return SettingsModel.create({ userId });
}
