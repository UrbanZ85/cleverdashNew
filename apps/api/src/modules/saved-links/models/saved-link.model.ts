import { Schema, model, type InferSchemaType } from 'mongoose';

// Shranjena stran je OSEBEN podatek: `userId` je obvezen in prvi člen vsakega indeksa, enako
// kot pri kamerah in beležkah po 004. Izolacija med uporabniki je zagotovljena z `userId` na
// vsaki poizvedbi (domain/link-input.ts, `buildLinksFilter`), ne s sistemom obsegov — zato
// tuj zapis vrne 404, ne 403.
//
// Slike favicona TU NI in ne sme biti (research.md §4): v zapisu je samo razrešeni NASLOV,
// bajti pa gredo prek `platform/cache` s ključem po GOSTITELJU. Base64 v dokumentu bi napihnil
// vsak izpis seznama in podvojil isto sliko pri vsakem zapisu istega gostitelja.
const savedLinkSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** NORMALIZIRAN naslov (domain/link-url.ts) — tak, kot ga odpre brskalnik. */
    url: { type: String, required: true, maxlength: 2048 },
    /** Nikoli prazen: nadomestek je gostitelj naslova (domain/link-input.ts). */
    title: { type: String, required: true, maxlength: 200 },
    /** `manual` prepreči, da bi samodejno branje prepisalo uporabnikov vnos (FR-014). */
    titleSource: { type: String, enum: ['manual', 'auto'], default: 'auto' },
    comment: { type: String, default: null, maxlength: 1000 },
    /** Ime Ionicons ikone; `null` pomeni "brez izbire" in prepusti mesto faviconu
     * (research.md §9) — NE "privzeta ikona", sicer favicona ne bi bilo nikoli videti. */
    icon: { type: String, default: null },
    /** RAZREŠENI naslov favicona. Slike ni v zapisu. */
    faviconUrl: { type: String, default: null },
    /** `null` = nerazvrščeno, veljavno stanje in ne pomanjkljivost (FR-021). */
    groupId: { type: Schema.Types.ObjectId, ref: 'SavedLinkGroup', default: null },
    order: { type: Number, required: true, default: 0 },
    /** Izpeljano ob vsakem pisanju: zloženo `title + url + comment` (research.md §6). */
    searchText: { type: String, required: true, default: '' },
    /** Izid zadnjega branja strani; `skipped` = naslov ni prestal varovala odhodnih naslovov
     * in strežnik strani NI obiskal. Nobeno od stanj ne pomeni, da zapis ni veljaven (FR-004,
     * člen VII: izid ni skrit v dnevnik, ampak je polje v odgovoru). */
    metadataStatus: { type: String, enum: ['ok', 'skipped', 'failed'], default: 'skipped' },
    metadataFetchedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

// Seznam, kot ga vidi uporabnik — TOČNO vrstni red iz `GET /saved-links` (sort=manual),
// sicer bi Mongo sortiral v pomnilniku.
savedLinkSchema.index({ userId: 1, groupId: 1, order: 1 });
// Ploščica na nadzorni plošči: 6 nazadnje shranjenih (sort=recent, FR-050).
savedLinkSchema.index({ userId: 1, createdAt: -1 });
// NI unikaten: isti naslov dvakrat je dovoljeno in se samo javi prek `duplicateOfId`
// (research.md §10) — ista stran je lahko namenoma v dveh mapah z dvema komentarjema.
savedLinkSchema.index({ userId: 1, url: 1 });

// Indeksa nad `searchText` namenoma NI: iskanje je nesidran regularni izraz, ki ga indeks ne
// pospeši, zbirka pa je po predpostavki iz spec.md nekaj sto zapisov na uporabnika.

export type SavedLinkDoc = InferSchemaType<typeof savedLinkSchema>;
export const SavedLinkModel = model('SavedLink', savedLinkSchema);
