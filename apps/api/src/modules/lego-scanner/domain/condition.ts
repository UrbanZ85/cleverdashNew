import type { LegoCondition } from './types.js';

// Razvrstitev stanja (018, FR-004). Čista funkcija nad eBay `conditionId` in besedilom oglasa.
//
// Pravilo, ki ga ta datoteka varuje: KOMPLETNOST RABLJENEGA SE NE DOMNEVA. `USED_COMPLETE` samo, kadar
// besedilo nedvoumno pravi "komplett/complete/completo" in nikjer ne pravi nasprotnega; kadar pravi
// nasprotno, je `USED_INCOMPLETE`; sicer `UNKNOWN`. Pri nasprotujočih si signalih (nov v kategoriji,
// rabljen v besedilu) je `UNKNOWN`, ne ugibanje.
//
// eBay `conditionId`: 1000 nov (neodprt, v originalni embalaži — uradna definicija eBay), 1500 nov
// z odprto škatlo ("New other"), 2750 kot nov, 3000 rabljen, 4000 zelo dobro, 5000 dobro,
// 6000 sprejemljivo, 7000 za dele.

const INCOMPLETE = /(unvollst|nicht\s+(?:ganz\s+)?komplett|\bfehl(?:t|en)\b|teile\s+fehlen|missing|incomplet[oe]|\bmanc(?:a|ano|ante|anti)\b|\bnon\s+complet\w*|nepopoln|manjka\w*|brez\s+(?:nekaj|dolo)\w*|defekt)/i;
const COMPLETE = /(\bkomplett\b|\bvollst[aä]ndig\b|\bcomplete\b|\bcompleto\b|\bcompleta\b|\bkompleten\b|\bpopoln\w*|\b100\s?%\s*komplett)/i;
const SEALED = /(versiegelt|ungeöffnet|ungeoeffnet|originalverpackt|\bovp\b|\bsealed\b|\bmisb\b|\bnisb\b|sigillat\w*|zapečat\w*|factory\s+sealed|neu\s*(?:&|und)?\s*ovp)/i;
const OPENED = /(geöffnet|geoeffnet|\bopened\b|open\s*box|\baperta\b|\baperto\b|odprt\w*\s+(?:škatl|embalaž)\w*)/i;
const USED_WORDS = /(gebraucht|\bused\b|usato|rabljen\w*|bespielt|second\s*hand)/i;
const NEW_WORDS = /(\bneu\b|\bnew\b|nuovo|\bnov\b|\bnovo\b)/i;
const PARTS_ONLY = /(for\s+parts|nur\s+teile|parts\s+only|bastler|ersatzteile)/i;

const BOX_YES = /((?:mit|und|inkl\.?|inklusive|plus)\s+(?:ovp|originalverpackung|original\s*box|box|karton|schachtel)|box\s+(?:included|inklusive)|with\s+(?:original\s+)?box|con\s+scatola|originalkarton\s+(?:dabei|vorhanden)|z\s+(?:originalno\s+)?škatlo)/i;
const BOX_NO = /(ohne\s+(?:ovp|originalverpackung|original\s*box|box|karton|schachtel)|without\s+(?:the\s+)?box|no\s+box|senza\s+scatola|brez\s+škatle)/i;
const INSTR_YES = /((?:mit|und|inkl\.?|inklusive|plus)\s+(?:der\s+)?(?:bauanleitung|anleitung)|with\s+instructions|con\s+istruzioni|bauanleitung\s+(?:dabei|vorhanden|inklusive)|z\s+navodili)/i;
const INSTR_NO = /(ohne\s+(?:bauanleitung|anleitung)|no\s+instructions|without\s+instructions|senza\s+istruzioni|brez\s+navodil)/i;

const NEW_IDS = new Set(['1000']);
const NEW_OTHER_IDS = new Set(['1500']);
const USED_IDS = new Set(['2750', '3000', '4000', '5000', '6000']);
const PARTS_IDS = new Set(['7000']);

export interface ConditionInput {
  conditionId: string | null;
  conditionText: string | null;
  /** Naslov + kratek opis. */
  text: string;
}

export interface ConditionResult {
  condition: LegoCondition;
  /** `true` samo ob izrecni navedbi kompletnosti pri rabljenem; sicer izpuščeno. */
  completenessVerified?: boolean;
  boxIncluded?: boolean;
  instructionsIncluded?: boolean;
  reason: string;
}

export function classifyCondition(input: ConditionInput): ConditionResult {
  const text = `${input.text} ${input.conditionText ?? ''}`;
  const extras: Pick<ConditionResult, 'boxIncluded' | 'instructionsIncluded'> = {};
  if (BOX_NO.test(text)) extras.boxIncluded = false;
  else if (BOX_YES.test(text)) extras.boxIncluded = true;
  if (INSTR_NO.test(text)) extras.instructionsIncluded = false;
  else if (INSTR_YES.test(text)) extras.instructionsIncluded = true;

  const incomplete = INCOMPLETE.test(text);
  const complete = !incomplete && COMPLETE.test(text);
  const sealed = SEALED.test(text);
  const opened = OPENED.test(text);
  const id = input.conditionId;

  if ((id && PARTS_IDS.has(id)) || PARTS_ONLY.test(text)) {
    return { condition: 'PARTS_ONLY', ...extras, reason: 'Oglas je označen za dele.' };
  }

  if (id && NEW_IDS.has(id)) {
    if (opened) return { condition: 'NEW_OPEN_BOX', ...extras, reason: 'Novo, a besedilo omenja odprto škatlo.' };
    if (USED_WORDS.test(text) && !NEW_WORDS.test(text)) {
      return { condition: 'UNKNOWN', ...extras, reason: 'Kategorija pravi novo, besedilo rabljeno — stanje ni jasno.' };
    }
    return { condition: 'NEW_SEALED', ...extras, reason: 'eBay: novo, neodprto v originalni embalaži.' };
  }
  if (id && NEW_OTHER_IDS.has(id)) {
    return { condition: 'NEW_OPEN_BOX', ...extras, reason: 'eBay: novo, odprta škatla ali brez originalne embalaže.' };
  }
  if (id && USED_IDS.has(id)) {
    if (sealed && !USED_WORDS.test(input.conditionText ?? '')) {
      return { condition: 'UNKNOWN', ...extras, reason: 'Kategorija pravi rabljeno, besedilo zapečateno — stanje ni jasno.' };
    }
    if (incomplete) return { condition: 'USED_INCOMPLETE', ...extras, reason: 'Rabljeno; besedilo omenja manjkajoče dele.' };
    if (complete) return { condition: 'USED_COMPLETE', completenessVerified: true, ...extras, reason: 'Rabljeno; prodajalec izrecno navaja, da je kompletno.' };
    return { condition: 'UNKNOWN', ...extras, reason: 'Rabljeno; kompletnost ni navedena in se ne domneva.' };
  }

  // Brez eBay stanja (drug vir): samo besedilo, previdno.
  if (sealed && !opened && !USED_WORDS.test(text)) return { condition: 'NEW_SEALED', ...extras, reason: 'Besedilo navaja neodprto/zapečateno.' };
  if (opened && !USED_WORDS.test(text)) return { condition: 'NEW_OPEN_BOX', ...extras, reason: 'Besedilo navaja odprto škatlo.' };
  if (USED_WORDS.test(text)) {
    if (incomplete) return { condition: 'USED_INCOMPLETE', ...extras, reason: 'Rabljeno; besedilo omenja manjkajoče dele.' };
    if (complete) return { condition: 'USED_COMPLETE', completenessVerified: true, ...extras, reason: 'Rabljeno; prodajalec izrecno navaja, da je kompletno.' };
    return { condition: 'UNKNOWN', ...extras, reason: 'Rabljeno; kompletnost ni navedena in se ne domneva.' };
  }
  return { condition: 'UNKNOWN', ...extras, reason: 'Stanje iz oglasa ni razvidno.' };
}
