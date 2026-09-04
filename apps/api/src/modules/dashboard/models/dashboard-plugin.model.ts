import { Schema, model, type InferSchemaType } from 'mongoose';

// 005: uporabniško definirana ploščica ("vtičnik"). Za razliko od vgrajenih vrst
// (weather/forecast/radar), ki so vpisane v kodi, te definira uporabnik sam in jih je
// lahko poljubno mnogo.
//
// RAZPOREDITEV NI TUKAJ. Vrstni red in vidnost ostaneta v `Settings.tiles`, kjer sta že za
// vgrajene ploščice — vnos vtičnika je `{ type: 'plugin', position, visible,
// config: { pluginId } }`. Polje `config` na vnosu razporeditve za to že obstaja od 001.
// Dva vira resnice za vrstni red bi pomenila dve poti, ki se lahko razideta.
//
// Per-user po vzorcu 004: `userId` je del vsake poizvedbe, zato tuj dokument vrne 404 in
// ne 403 (glej findCameraOr404 v modules/cameras/router.ts).

export const PLUGIN_KINDS = ['link', 'iframe', 'image', 'json'] as const;
export type PluginKind = (typeof PLUGIN_KINDS)[number];

const jsonFieldSchema = new Schema(
  {
    label: { type: String, required: true },
    /** Pikčasta pot v odgovoru vira, npr. `observation.t` — glej domain/json-path.ts. */
    path: { type: String, required: true },
    unit: { type: String, default: null },
  },
  { _id: false },
);

const dashboardPluginSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    /** Ime ikone iz registra na odjemalcu (core/icons/register-icons.ts). Neregistrirano
     * ime se izriše kot prazen prostor, zato ga vmesnik ponudi iz seznama, ne kot polje. */
    icon: { type: String, default: 'apps-outline' },
    kind: { type: String, enum: PLUGIN_KINDS, required: true },
    url: { type: String, required: true, maxlength: 2048 },

    // ─── Nastavitve po vrsti. Ena shema za vse štiri: ločene poddokumente bi Mongoose
    // zahteval kot diskriminatorje, kar je za štiri polja odveč. Kaj je za katero vrsto
    // pomembno, uveljavlja Zod v routerju.
    /** link: odpri v novem zavihku. */
    openInNewTab: { type: Boolean, default: true },
    /** link: neobvezen opis pod naslovom. */
    description: { type: String, default: null, maxlength: 200 },
    /** iframe: višina vdelanega okvirja. */
    heightPx: { type: Number, default: 320, min: 80, max: 1200 },
    /** Širina ploščice v slikovnih točkah.
     *
     * Do 005 je bila širina izražena v STOLPCIH mreže (1–3), kar je pomenilo, da je bila
     * dejanska širina odvisna od tega, koliko stolpcev je mreža tisti trenutek imela —
     * uporabnik ni mogel povedati "tole naj bo 480 px široko". Zdaj je enota ista kot pri
     * `heightPx`: slikovna točka. Na ožjem zaslonu se ploščica še vedno zoži na razpoložljivo
     * širino (odjemalec ji da `max-width: 100%`), navzgor pa je natanko to, kar tu piše.
     *
     * VIDEZ ploščice je tu, RAZPOREDITEV (vrstni red, vidnost) pa ostaja v `Settings.tiles`
     * — enako kot `heightPx`. */
    widthPx: { type: Number, default: 320, min: 200, max: 1600 },
    /** image + json: kako pogosto sme strežnik osvežiti vir (člen VIII — spodnja meja je
     * namenoma 30 s, da vtičnik ne postane orodje za obstreljevanje tujega vira). */
    refreshSeconds: { type: Number, default: 300, min: 30, max: 86_400 },
    /** image: nadomestno besedilo. */
    alt: { type: String, default: null, maxlength: 200 },
    /** json: katera polja se izrišejo. */
    fields: { type: [jsonFieldSchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

// Edinstvenost je v obsegu uporabnika, ne globalna (004) — dva človeka smeta imeti vtičnik
// z istim imenom.
dashboardPluginSchema.index({ userId: 1, name: 1 }, { unique: true });

export type DashboardPluginDoc = InferSchemaType<typeof dashboardPluginSchema>;
export const DashboardPluginModel = model('DashboardPlugin', dashboardPluginSchema);
