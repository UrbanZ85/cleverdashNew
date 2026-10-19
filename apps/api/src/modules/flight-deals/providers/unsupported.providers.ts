import type { ProviderQuery } from '../domain/query-plan.js';
import { unsupportedResult, type FlightProvider } from './types.js';

// Wizz Air in easyJet: adapterja, ki vrneta `unsupported` (research.md §6).
//
// Obstajata zato, da `GET /flight-deals/providers` pove, da vira NISTA podprta in ZAKAJ, namesto
// da ju v seznamu ne bi bilo. Nobenega omrežnega klica ni: Wizz Air spletno iskanje stoji za
// Kasada bot zaščito in AWS WAF, easyJet za Akamai Bot Manager — obhod česar koli od tega
// prepovedujeta člen XII in naročilo (FR-021). Ko bo kdaj na voljo dovoljena pot (Duffel za
// easyJet), se zamenja vsebina te datoteke in nič drugega.

const WIZZ_MESSAGE =
  'Wizz Air javnega vmesnika nima in avtomatiziran dostop preprečuje z zaščito pred roboti; vir ni podprt (člen XII).';
const EASYJET_MESSAGE =
  'easyJet javnega vmesnika nima in spletno iskanje ščiti pred roboti; vir ni podprt (člen XII). Dovoljena pot (Duffel) je predvidena za poznejšo dopolnitev.';

function unsupportedProvider(id: 'wizzair' | 'easyjet', label: string, message: string): FlightProvider {
  return {
    id,
    label,
    official: false,
    notice: message,
    dailyRunLimit: null,
    bookingHosts: [],
    maxConcurrency: 1,
    minGapMs: 0,
    local: true,
    isEnabled: () => false,
    buildQueries: (): ProviderQuery[] => [],
    request: () => ({ url: '', headers: {} }),
    parse: () => unsupportedResult(message),
  };
}

export const wizzairProvider = unsupportedProvider('wizzair', 'Wizz Air', WIZZ_MESSAGE);
export const easyjetProvider = unsupportedProvider('easyjet', 'easyJet', EASYJET_MESSAGE);
