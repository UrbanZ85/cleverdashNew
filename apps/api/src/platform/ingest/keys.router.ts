import { randomBytes, createHash } from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { ApiKeyModel } from '../apikeys/model.js';
import { ADMIN_SCOPE } from '../auth/scopes.js';
import { loadEnv } from '../config/env.js';
import { badRequest, forbidden, notFound, unauthorized } from '../errors/problem.js';
import { buildCurlExample, buildIngestInstructions } from './instructions.js';
import { findIngestTarget, listIngestTargets, type IngestTarget } from './registry.js';

// `/ingest/keys*` — izdaja in preklic AGENTSKIH ključev.
//
// ZAKAJ SVOJA POT IN NE `/api-keys`. Obstoječa pot je administratorska in taka mora ostati: z njo
// se izda ključ s poljubnim obsegom, kar je poteza, ki lahko odpre karkoli v tej namestitvi
// (`tests/contract/api-keys.spec.ts` to tudi preverja — navaden uporabnik tam dobi 403). Agentski
// ključ je druga stvar: izda ga LASTNIK PODATKOV zase, obsegov si ne izbere (izpeljejo se iz
// izbranih ciljev) in `admin` po nobeni poti ne more priti vanj. Dve poti zato, ker sta to dve
// odločitvi z različnima tveganjema in različnima odgovornima — ne zato, da bi bila koda lepša.
//
// Ključ je ISTI zapis (`ApiKeyModel`) in gre skozi ISTI vratar (`platform/apikeys/guard.ts`).
// Ločena zbirka bi pomenila drugo mesto za preklic, drugo za iztek in drug seznam, ki ga je ob
// sumu zlorabe treba pregledati — trije kraji namesto enega, da bi se izognili enemu polju.
export const ingestKeysRouter = Router();

/** Privzeta veljavnost, kadar je uporabnik ne določi. Ključ, ki ga človek prilepi v tuj pogovorni
 * vmesnik, ne sme veljati večno po pomoti — mora pa veljati dovolj dolgo, da se uporabnik ne uči
 * postopka vsak teden znova. */
const DEFAULT_EXPIRY_DAYS = 90;
const MAX_EXPIRY_DAYS = 3650;

const createKeySchema = z.object({
  label: z.string().trim().min(1).max(80),
  /** Vsaj en cilj: ključ brez cilja ne bi mogel ničesar shraniti in bi bil samo poverilnica, ki
   * čaka na zlorabo. Ista logika kot `scopes` (člen III) — praznega ne sme biti. */
  targets: z.array(z.string().trim().min(1).max(64)).min(1).max(20),
  /** `null` pomeni IZRECNO "brez roka". Izpuščeno polje pomeni "privzeto" — razlike ni mogoče
   * izraziti z eno vrednostjo, zato sta obe obliki dovoljeni in se obravnavata drugače. */
  expiresInDays: z.number().int().min(1).max(MAX_EXPIRY_DAYS).nullish(),
});

function generateSecret(): { secret: string; keyHash: string; keyPrefix: string } {
  const secret = `cd_${randomBytes(24).toString('hex')}`;
  const keyHash = createHash('sha256').update(secret).digest('hex');
  return { secret, keyHash, keyPrefix: secret.slice(0, 8) };
}

/**
 * Kdo izdaja ključ.
 *
 * Samo prijavljen ČLOVEK. Ključ, ki izdaja ključe, je podvojevalnik poverilnic: iz enega
 * uhajanja nastane neomejeno število nadaljnjih, preklic prvega pa jih ne ustavi. Zato je
 * `subjectType === 'apiKey'` tu zavrnjen, čeprav bi obsegi zadoščali.
 */
function requireHuman(req: Request): string {
  if (!req.auth) throw unauthorized('Zahtevana je avtentikacija.');
  if (req.auth.subjectType !== 'user') {
    throw forbidden('Agentski ključ lahko izda samo prijavljen uporabnik, ne drug ključ.');
  }
  return req.auth.subjectId;
}

/**
 * Cilji, ki jih sme ta človek dati ključu.
 *
 * Pravilo je eno: ključ ne more dobiti več, kot ima izdajatelj. Brez tega bi bila izdaja ključa
 * pot do stopnjevanja pravic — uporabnik brez `recipes:write` bi si izdal ključ, ki recepte piše
 * namesto njega.
 */
function grantableTargets(req: Request): IngestTarget<never>[] {
  const scopes = req.auth?.scopes ?? [];
  if (scopes.includes(ADMIN_SCOPE)) return listIngestTargets();
  return listIngestTargets().filter((t) => scopes.includes(t.scope));
}

function keyView(doc: {
  _id: unknown;
  label: string;
  keyPrefix: string;
  scopes: string[];
  targets?: string[];
  lastUsedAt?: Date | null;
  expiresAt?: Date | null;
}) {
  const targets = doc.targets ?? [];
  return {
    id: String(doc._id),
    label: doc.label,
    keyPrefix: doc.keyPrefix,
    scopes: doc.scopes,
    targets,
    // Prikazna imena ciljev za zaslon: odjemalec naj ne prevaja `recipes` → `Recepti` sam
    // (člen XI). Cilj, ki ga register ne pozna več (odstranjen modul), IZPADE — tako kot
    // soudeleženec, ki ga imenik ne pozna, izpade iz recepta.
    targetTitles: targets.map((key) => findIngestTarget(key)?.title).filter((t): t is string => !!t),
    lastUsedAt: doc.lastUsedAt ?? null,
    expiresAt: doc.expiresAt ?? null,
  };
}

/** Seznam agentskih ključev tega človeka. Vidi SAMO svoje — tudi administrator, ker gre za
 * njegovo lastno orodje in ne za nadzorno ploščo namestitve. Ključi brez ciljev (izdani prek
 * `/api-keys`) sem ne sodijo: to je zaslon za agente, ne za vse poverilnice. */
ingestKeysRouter.get('/ingest/keys', async (req, res, next) => {
  try {
    const userId = requireHuman(req);
    const keys = await ApiKeyModel.find(
      { ownerId: userId, revokedAt: null, targets: { $ne: [] } },
      { keyHash: 0 },
    ).lean();
    res.json(keys.map(keyView));
  } catch (err) {
    next(err);
  }
});

/**
 * Izdaja ključa. Odgovor vsebuje čistopis IN celotno navodilo za agenta.
 *
 * Navodilo je tu in ne v ločenem klicu zato, ker je čistopis viden samo v tem odgovoru: navodilo
 * z vdelanim ključem ne more nastati nikoli več. Uporabnik torej kopira eno polje, ne dveh, ki bi
 * ju moral sestaviti sam — to je cela poanta te funkcionalnosti.
 *
 * `Idempotency-Key` ta pot NE sprejme: člen III, izjema za izdajo žetonov. Shranjen odgovor bi ob
 * ponovitvi vrnil čistopis ključa, ki je medtem morda že preklican.
 */
ingestKeysRouter.post('/ingest/keys', async (req, res, next) => {
  try {
    const userId = requireHuman(req);
    const body = createKeySchema.parse(req.body);

    const grantable = grantableTargets(req);
    const chosen: IngestTarget<never>[] = [];
    for (const key of body.targets) {
      const target = grantable.find((t) => t.key === key);
      if (!target) {
        throw badRequest(
          `Cilj "${key}" ne obstaja ali zanj nimaš pravic. Na voljo: ${grantable.map((t) => t.key).join(', ') || '(nobeden)'}.`,
        );
      }
      // Podvojen cilj v seznamu ni napaka klicatelja, vredna zavrnitve — je posledica odjemalca,
      // ki je isto polje poslal dvakrat. Tiho se združi.
      if (!chosen.some((t) => t.key === target.key)) chosen.push(target);
    }

    // OBSEGI SE IZPELJEJO IZ CILJEV in jih klicatelj ne pošlje. To je bistvena razlika do
    // `/api-keys`: tam obseg izbere administrator in nosi odgovornost zanj, tu pa bi prosto polje
    // pomenilo, da si uporabnik prek agentskega ključa izda karkoli, kar ima sam. `admin` tako po
    // nobeni poti ne more priti v agentski ključ, tudi kadar ga izda administrator.
    const scopes = [...new Set(chosen.map((t) => t.scope))];

    const expiresAt =
      body.expiresInDays === null
        ? null
        : new Date(Date.now() + (body.expiresInDays ?? DEFAULT_EXPIRY_DAYS) * 86_400_000);

    const { secret, keyHash, keyPrefix } = generateSecret();
    const created = await ApiKeyModel.create({
      label: body.label,
      scopes,
      targets: chosen.map((t) => t.key),
      ownerId: userId,
      keyHash,
      keyPrefix,
      expiresAt,
    });

    const { PUBLIC_BASE_URL } = loadEnv();
    const instructionsInput = {
      baseUrl: PUBLIC_BASE_URL,
      secret,
      targets: chosen,
      expiresAt,
    };

    res.status(201).json({
      ...keyView(created.toObject()),
      // Čistopis se pokaže samo tukaj, samo enkrat, in ni obnovljiv.
      secret,
      instructions: buildIngestInstructions(instructionsInput),
      curl: buildCurlExample(instructionsInput),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Navodilo za obstoječ ključ, BREZ ključa samega.
 *
 * Obstaja za primer "obliko sem izgubil, ključ pa imam shranjen v upravitelju gesel". Namesto
 * ključa je v besedilu nadomestek `<TVOJ-KLJUC>` — ne izmišljena vrednost in ne prazno mesto, ki
 * bi ga bilo mogoče spregledati. Če je človek izgubil ključ, je edina pot nov ključ; ta pot mu
 * tega ne skriva in mu ne ponuja bližnjice, ki je ni.
 */
ingestKeysRouter.get('/ingest/keys/:keyId/instructions', async (req, res, next) => {
  try {
    const userId = requireHuman(req);
    const key = await ApiKeyModel.findOne({
      _id: req.params.keyId,
      ownerId: userId,
      revokedAt: null,
    }).lean();
    if (!key) throw notFound('Ključ ne obstaja ali je preklican.');

    const targets = (key.targets ?? [])
      .map((k) => findIngestTarget(k))
      .filter((t): t is IngestTarget<never> => t !== null);
    if (targets.length === 0) {
      throw notFound('Ta ključ nima nobenega cilja, ki bi še obstajal v tej namestitvi.');
    }

    const { PUBLIC_BASE_URL } = loadEnv();
    const input = { baseUrl: PUBLIC_BASE_URL, secret: null, targets, expiresAt: key.expiresAt ?? null };
    res.json({
      instructions: buildIngestInstructions(input),
      curl: buildCurlExample(input),
      secretAvailable: false,
    });
  } catch (err) {
    next(err);
  }
});

/** Preklic je `revokedAt` in ne brisanje — enako kot pri `/api-keys`, da ostane sled v dnevniku
 * o tem, da je ključ obstajal. Človek prekliče SAMO svoj ključ. */
ingestKeysRouter.delete('/ingest/keys/:keyId', async (req, res, next) => {
  try {
    const userId = requireHuman(req);
    const result = await ApiKeyModel.updateOne(
      { _id: req.params.keyId, ownerId: userId, revokedAt: null },
      { revokedAt: new Date() },
    );
    if (result.matchedCount === 0) {
      next(notFound('Ključ ne obstaja ali je že preklican.'));
      return;
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
