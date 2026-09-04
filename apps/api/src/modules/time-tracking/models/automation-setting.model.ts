import { Schema, model, type InferSchemaType } from 'mongoose';

// Osebno stikalo avtomatizacije: ali se TEMU uporabniku urniki sploh izvajajo.
//
// Drugo od dveh stikal. Prvo je `SCHEDULER_ENABLED` v okolju — to je stikalo NAMESTITVE
// (ali tik sploh teče, main.ts). To tukaj je stikalo OSEBE. Oba morata biti vklopljena;
// prisoten scheduler sam po sebi ne pomeni, da sme kdorkoli klikati po delodajalčevi strani.
// Ista dvojica in isti razlog kot pri privolitvi za prepis govora
// (platform/settings/consent.service.ts): ključ v okolju je dovoljenje namestitve, stikalo
// pa privolitev osebe.
//
// Zakaj lastna kolekcija in ne polje v `Settings`: člen I — modul ima lastne kolekcije,
// brisanje mape modula mora odnesti tudi to stanje. `Settings` gostijo osebne nastavitve,
// ki jih ureja zaslon Nastavitve; TO stikalo pa ima stranske učinke v modulu (izklop prekliče
// načrtovane akcije, vklop načrt sestavi znova), zato mora biti last modula.
//
// PRIVZETO IZKLOPLJENO. Manjkajoč dokument pomeni "izklopljeno" — nihče ne sme dobiti
// avtomatike, ki je ni izrecno vklopil (člen VI in člen XII: klikanje po tuji strani je
// dejanje, ne privzetek).
const automationSettingSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    enabled: { type: Boolean, default: false },
    /** Kdaj je bilo stikalo nazadnje premaknjeno — za diagnostiko "od kdaj se ne izvaja". */
    changedAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);

export type AutomationSettingDoc = InferSchemaType<typeof automationSettingSchema>;
export const AutomationSettingModel = model('TimeTrackingAutomationSetting', automationSettingSchema);
