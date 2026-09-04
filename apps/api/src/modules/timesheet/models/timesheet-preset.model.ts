import { Schema, model, type InferSchemaType } from 'mongoose';

// Edina kolekcija tega modula (člen I: modul ima svoje kolekcije). Hrani samo to, kar je za
// vsak mesec enako — ime, tedenske ure, urnik — da uporabniku ni treba istih štirih časov
// vpisovati vsakič znova. Sama evidenca se NE shranjuje: dokument je izpeljan iz vnosa in
// ga uporabnik odda naprej, zato bi bila kopija v bazi drugi vir resnice brez lastnika.
const timeHmSchema = new Schema(
  {
    h: { type: Number, required: true, min: 0, max: 23 },
    m: { type: Number, required: true, min: 0, max: 59 },
  },
  { _id: false },
);

const timesheetPresetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    // `null`, dokler ga uporabnik ne shrani: evidenca se lahko izpolnjuje za osebo, ki ni
    // prijavljeni uporabnik, zato ime NI privzeto ime računa (odjemalec ga predlaga, člen III
    // pa zahteva, da je enak klic mogoč tudi brez UI — takrat pride ime v telesu zahteve).
    fullName: { type: String, default: null },
    weeklyWorkHours: { type: Number, default: 40, min: 1, max: 80 },
    schedule: {
      arrival: { type: timeHmSchema, required: true },
      departure: { type: timeHmSchema, required: true },
      breakStart: { type: timeHmSchema, required: true },
      breakEnd: { type: timeHmSchema, required: true },
    },
  },
  { timestamps: true, versionKey: false },
);

export type TimesheetPresetDoc = InferSchemaType<typeof timesheetPresetSchema>;
export const TimesheetPresetModel = model('TimesheetPreset', timesheetPresetSchema);
