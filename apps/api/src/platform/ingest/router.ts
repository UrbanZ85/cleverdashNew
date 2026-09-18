import { Router, type Request } from 'express';
import { z } from 'zod';
import { resolveAutomationOwnerUserId } from '../auth/automation-owner.js';
import { ADMIN_SCOPE } from '../auth/scopes.js';
import { loadEnv } from '../config/env.js';
import { badRequest, forbidden, notFound, unauthorized } from '../errors/problem.js';
import {
  findIngestTarget,
  listIngestTargets,
  type IngestOutcome,
  type IngestTarget,
} from './registry.js';

// `POST /api/v1/ingest` — ENA vstopna točka, ki jo dobi agent (ChatGPT, n8n, karkoli drugega).
//
// ZAKAJ ENA POT IN NE `/ingest/recipes`, `/ingest/notes` … Naslov je edino, kar uporabnik
// prilepi v pogovor z agentom, in navodilo se vanj zapiše enkrat. Z eno potjo je razširitev na
// nov cilj sprememba ENE besede v telesu, ki jo agent izbere sam, ne pa nov naslov, ki ga mora
// človek znova prilepiti. Cena je ovojnica `{target, data}` in je zavestno plačana.
//
// To NI stranska vrata mimo obsegov. Vsak cilj nosi svoj obseg (`IngestTarget.scope`) in ta se
// preveri ob vsaki zahtevi — uvoz v recepte zahteva natanko `recipes:write`, isto kot
// `POST /recipes`. Ključ ima poleg tega še SVOJ seznam dovoljenih ciljev (`ApiKey.targets`), ki
// je ožji od obsegov: ključ za agenta sme pisati recepte in nič drugega, tudi kadar bi obsegi
// dovolili več. Dve zapori, ne ena — ključ, ki ga človek prilepi v tuj pogovorni vmesnik, je
// najbolj izpostavljena poverilnica v tej namestitvi.
export const ingestRouter = Router();

/** Zgornja meja svežnja. Agent, ki pošlje 500 zapisov, se je skoraj gotovo zmotil pri branju
 * strani — in zavrnitev je cenejša od 500 zapisov, ki jih mora človek pobrisati na roko.
 * Rezanje (kot pri sestavinah) tu NI pravo: tam gre za predolg seznam v ENEM zapisu, tu pa bi
 * tiho izpustili cele zapise, o katerih agent misli, da so shranjeni. */
const MAX_BATCH = 25;

const ingestBodySchema = z.object({
  /** Neobvezen, kadar ima ključ natanko en cilj — takrat ni česa izbirati in zahteva po polju
   * bi bila samo priložnost za napako agenta. */
  target: z.string().trim().min(1).max(64).optional(),
  data: z.union([z.record(z.unknown()), z.array(z.record(z.unknown())).max(MAX_BATCH)]),
});

/**
 * Cilji, ki jih ta klicatelj sme uporabiti.
 *
 * Presek DVEH omejitev, ne ene:
 *  - obsegi klicatelja (`req.auth.scopes`) — isto merilo kot pri vsaki drugi poti;
 *  - seznam ciljev NA KLJUČU (`req.apiKey.targets`) — velja samo za API ključ.
 *
 * Prijavljen človek druge omejitve nima: v vmesniku lahko itak ustvari recept, beležko in
 * povezavo, zato bi ga seznam ciljev omejeval pri nečem, kar sme že tako ali tako. Omejitev
 * obstaja zaradi ključa, ne zaradi človeka.
 */
function allowedTargets(req: Request): IngestTarget<never>[] {
  const scopes = req.auth?.scopes ?? [];
  const isAdmin = scopes.includes(ADMIN_SCOPE);
  const keyTargets = req.apiKey?.targets ?? null;

  return listIngestTargets().filter((target) => {
    if (!isAdmin && !scopes.includes(target.scope)) return false;
    if (keyTargets && !keyTargets.includes(target.key)) return false;
    return true;
  });
}

/**
 * Uporabnik, ki bo LASTNIK nastalega zapisa.
 *
 * Za prijavljenega človeka je to on sam. Za ključ je to `ApiKey.ownerId` — polje, ki ga je ta
 * funkcionalnost dodala natanko zato: doslej se je lastnik avtomatizacije UGIBAL
 * (`resolveAutomationOwnerUserId`, "če obstaja natanko en uporabnik"), kar je pri več
 * uporabnikih pomenilo, da avtomatizacija sploh ni imela komu pisati. Ključ, izdan iz Nastavitev,
 * zdaj ve, čigav je. Ugibanje ostane samo za ključe, izdane pred to spremembo.
 */
async function resolveOwner(req: Request): Promise<string> {
  if (req.auth?.subjectType === 'user') return req.auth.subjectId;
  if (req.apiKey?.ownerId) return req.apiKey.ownerId;
  const fallback = await resolveAutomationOwnerUserId();
  if (!fallback) {
    throw notFound(
      'Ključ ni vezan na uporabnika in lastnika ni mogoče ugotoviti. Izdaj nov ključ v Nastavitvah.',
    );
  }
  return fallback;
}

/** Opis cilja za odjemalce (zaslon Nastavitve, orodja). Shema NI vključena kot JSON Schema:
 * `fields` in `example` sta tisto, kar potrebujeta človek in agent, pretvorba Zod → JSON Schema
 * pa bi prinesla odvisnost in obliko, ki je noben od njiju ne bere. */
function describeTarget(target: IngestTarget<never>) {
  return {
    key: target.key,
    title: target.title,
    summary: target.summary,
    scope: target.scope,
    fields: target.fields,
    example: target.example,
  };
}

/**
 * Kaj ta klicatelj sme uvoziti.
 *
 * Obstaja, ker mora zaslon za izdajo ključa ponuditi cilje, ki dejansko obstajajo — seznam,
 * prepisan v odjemalca, bi se razšel z registrom ob prvem novem modulu (člen XI: naprava je
 * odjemalec, ne planer).
 */
ingestRouter.get('/ingest/targets', (req, res, next) => {
  try {
    if (!req.auth) throw unauthorized('Zahtevana je avtentikacija.');
    res.json(allowedTargets(req).map(describeTarget));
  } catch (err) {
    next(err);
  }
});

ingestRouter.post('/ingest', async (req, res, next) => {
  try {
    if (!req.auth) throw unauthorized('Zahtevana je avtentikacija.');

    const body = ingestBodySchema.parse(req.body);
    const permitted = allowedTargets(req);

    if (permitted.length === 0) {
      throw forbidden('Ta ključ nima nobenega dovoljenega cilja uvoza.');
    }

    // Izbira cilja. Izpuščen `target` je dovoljen SAMO pri enem samem dovoljenem cilju — pri več
    // ciljih bi privzetek pomenil, da zapis tiho pristane nekje, kjer ga agent ni nameraval
    // shraniti, in tega ne popravi noben odgovor 201.
    const requested = body.target ?? (permitted.length === 1 ? permitted[0]!.key : null);
    if (!requested) {
      throw badRequest(
        `Manjka polje "target". Izberi enega od: ${permitted.map((t) => t.key).join(', ')}.`,
      );
    }

    // NEZNAN IN NEDOVOLJEN CILJ DOBITA ISTI ODGOVOR — isti status in isto besedilo. Razlikovanje
    // ("ta cilj ne obstaja" proti "ta cilj ti ni dovoljen") bi klicatelju z omejenim ključem
    // povedalo, kateri moduli v tej namestitvi obstajajo, kar je podatek, do katerega prek tega
    // ključa nima dostopa. Ključ živi v tujem pogovornem vmesniku in ni nujno samo v rokah
    // lastnika — natanko zato je prvi dve različni napaki treba zliti v eno.
    //
    // 403 in ne 400: telo je pravilno oblikovano, samo pravic zanj ni. Seznam dovoljenih ciljev
    // v besedilu ni razkritje — to so cilji TEGA ključa, ki jih klicatelj že sme uporabljati.
    const target = findIngestTarget(requested);
    if (!target || !permitted.some((t) => t.key === target.key)) {
      throw forbidden(
        `Cilj "${requested}" ne obstaja ali s tem ključem ni dovoljen. Dovoljeni: ${permitted.map((t) => t.key).join(', ')}.`,
      );
    }

    const userId = await resolveOwner(req);
    const ctx = { userId, keyId: req.apiKey?.id ?? req.auth.subjectId };

    const items = Array.isArray(body.data) ? body.data : [body.data];
    if (items.length === 0) throw badRequest('Polje "data" je prazen seznam.');

    // CEL SVEŽENJ SE RAZČLENI PRED PRVIM ZAPISOM. Če bi se razčlenjevalo sproti, bi neveljaven
    // tretji zapis pustil prva dva shranjena, agent pa bi videl samo `400` — sklepal bi, da ni
    // shranjeno nič, in ob ponovnem poskusu podvojil prva dva. Tako neveljaven sveženj ne zapiše
    // ničesar in je odgovor `400` resničen.
    //
    // To NE naredi cele operacije atomarne: če odpove `handle()` sredi svežnja (npr. izpad baze),
    // prejšnji zapisi ostanejo. Transakcij čez več dokumentov v tej namestitvi ni (MongoDB brez
    // `--replSet`, glej recipe.model.ts), zato je meja tu zavestna: ujamemo napako v PODATKIH,
    // ki je pogosta in v celoti preprečljiva, ne pa izpada hrambe, ki ni.
    const parsedItems = items.map((item) => target.schema.parse(item));

    // Zaporedno in ne `Promise.all`: zapisi enega svežnja se pogosto podvajajo med sabo (agent
    // pošlje isti naslov dvakrat v istem seznamu), preverba dvojnika pa bere bazo. Vzporedno bi
    // se obe preverbi zgodili, preden bi katera koli videla zapis druge, in dvojnik bi nastal
    // kljub preverbi. Sveženj je največ 25 zapisov, zato hitrost ni razlog za drugačno izbiro.
    const outcomes: (IngestOutcome & { target: string })[] = [];
    for (const item of parsedItems) {
      const outcome = await target.handle(item, ctx);
      outcomes.push({ ...outcome, target: target.key });
    }

    const { PUBLIC_BASE_URL } = loadEnv();
    const base = PUBLIC_BASE_URL.replace(/\/+$/, '');
    const view = (outcome: IngestOutcome & { target: string }) => ({
      status: outcome.status,
      target: outcome.target,
      id: outcome.id,
      title: outcome.title,
      // Polni naslov in ne pot: agent ga pošlje nazaj človeku, ta pa ga klikne. Sestavljen ob
      // branju iz `PUBLIC_BASE_URL` (isti razlog kot `publicLink` pri receptih) — shranjen bi se
      // ob selitvi domene tiho pokvaril.
      url: `${base}${outcome.path}`,
      warnings: outcome.warnings ?? [],
    });

    const created = outcomes.filter((o) => o.status === 'created').length;

    // En zapis → en objekt; sveženj → seznam. Agent, ki je poslal en objekt, dobi odgovor, ki
    // ga zna prebrati brez indeksiranja, in obratno — oblika odgovora sledi obliki zahteve.
    //
    // 201 samo, kadar je res kaj nastalo. Sveženj samih dvojnikov je 200: nič ni nastalo in
    // `201 Created` bi bil neresničen, agent pa iz njega sklepa, da je delo opravljeno.
    if (!Array.isArray(body.data)) {
      const single = outcomes[0]!;
      res.status(single.status === 'created' ? 201 : 200).json(view(single));
      return;
    }

    res.status(created > 0 ? 201 : 200).json({
      created,
      duplicates: outcomes.length - created,
      results: outcomes.map(view),
    });
  } catch (err) {
    next(err);
  }
});
