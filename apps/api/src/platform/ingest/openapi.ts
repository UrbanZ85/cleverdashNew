import type { IngestField, IngestTarget } from './registry.js';

// OpenAPI 3.1 shema za **Custom GPT Action**.
//
// ZAKAJ TO SPLOH OBSTAJA. Prva izvedba je predpostavljala, da navodilo, prilepljeno v pogovor,
// zadošča — da bo ChatGPT zahtevo poslal sam. NE ZNA. Njegovo brskanje strani BERE (GET); nima
// orodja, ki bi poslalo telo in lastno glavo `X-API-Key`. V praksi je sestavil pravilen JSON,
// zahteve ni mogel poslati in je to sporočil kot napako omrežja ("could not resolve host") —
// videti je bilo kot okvara strežnika, ki je bil ves čas zdrav (`/api/v1/health` = 200).
//
// Edina pot, po kateri ChatGPT POST resnično pošlje, je Custom GPT z **Action**: OpenAPI shema +
// ključ, nastavljen v zavihku Authentication. Ta datoteka sestavi natanko tisto shemo. Za n8n,
// Shortcuts, `curl` in vse ostalo ostane navodilo iz `instructions.ts` — tam je bilo vedno
// dovolj, ker ta orodja POST znajo.
//
// SHEMA SE IZPELJE IZ REGISTRA, iz istih `fields` kot navodilo. Ročno vzdrževana shema bi se od
// pogodbe razšla ob prvi spremembi polja — in razšla bi se tiho, v nastavitvah tujega GPT-ja,
// kjer je noben test ne vidi. Člen III: pogodba JE OpenAPI in se vzdržuje skupaj s kodo.

export interface OpenApiInput {
  baseUrl: string;
  targets: readonly IngestTarget<never>[];
}

/**
 * Preslikava v JSON Schema. `fields` in ne pretvorba iz Zod sheme: `fields` je tisto, kar je s
 * testom vezano na `example` (glej `tests/unit/ingest-registry.spec.ts`), pretvornik Zod →
 * JSON Schema pa bi bil nova odvisnost, ki bi znala izraziti več, kot Action prebavi.
 */
function fieldSchema(field: IngestField): Record<string, unknown> {
  const description = field.description;
  switch (field.type) {
    case 'string[]':
      return { type: 'array', items: { type: 'string' }, description };
    case 'number':
      return { type: 'integer', description };
    case 'boolean':
      return { type: 'boolean', description };
    default:
      return { type: 'string', description };
  }
}

function targetBodySchema(target: IngestTarget<never>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const field of target.fields) properties[field.name] = fieldSchema(field);
  const required = target.fields.filter((f) => f.required).map((f) => f.name);

  return {
    type: 'object',
    description: target.summary,
    properties,
    // `required` se izpusti, kadar je prazen: `"required": []` nekatere različice
    // razčlenjevalnika Action zavrnejo kot neveljavno shemo.
    ...(required.length > 0 ? { required } : {}),
    // Brez tega GPT rade volje doda polje, ki ga strežnik ne pozna. Shema, ki to izrecno
    // prepove, je cenejša od 400, ki ga mora človek razvozlati v tujem pogovornem oknu.
    additionalProperties: false,
  };
}

/**
 * Ime operacije. Action zahteva `operationId` in ga uporablja kot IME ORODJA, ki ga model kliče —
 * zato je berljivo in ne naključno. Vezaj v ključu cilja (`saved-links`) gre v podčrtaj, ker
 * nekatere različice dovolijo samo `[A-Za-z0-9_]`.
 */
function operationId(target: IngestTarget<never>): string {
  return `shrani_${target.key.replace(/-/g, '_')}`;
}

/**
 * Cela shema.
 *
 * ENA POT NA CILJ (`/api/v1/ingest/recipes`) in ne skupna pot z `target` v telesu, ki jo
 * uporabljata `curl` in n8n. Razlog je izključno v tem, kako Action dela: model izbira med
 * ORODJI, ne med vrednostmi polja. Z eno potjo bi bilo orodje eno samo z razvejano shemo
 * (`oneOf` po vrednosti `target`) — obliko, ki jo Action slabo prebavi in pri kateri model redno
 * pošlje polja enega cilja pod imenom drugega. Z ločenimi potmi je "shrani recept" svoje orodje
 * s svojo shemo in izbire ni mogoče zgrešiti.
 *
 * Obe obliki vodita v ISTO kodo (`platform/ingest/router.ts`), zato to ni druga pogodba, ampak
 * drug zapis iste.
 */
export function buildIngestOpenApi(input: OpenApiInput): Record<string, unknown> {
  const base = input.baseUrl.replace(/\/+$/, '');
  const paths: Record<string, unknown> = {};

  for (const target of input.targets) {
    paths[`/api/v1/ingest/${target.key}`] = {
      post: {
        operationId: operationId(target),
        summary: target.summary,
        description: `${target.summary} Vse besedilo mora biti v slovenščini; če je izvorna stran v tujem jeziku, ga prevedi. Polja, ki ga na strani ni, ne pošlji.`,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: targetBodySchema(target) } },
        },
        responses: {
          '201': {
            description: 'Zapis je nastal.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/IngestResult' } } },
          },
          '200': {
            description: 'Zapis že obstaja; nič ni nastalo.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/IngestResult' } } },
          },
          '400': { description: 'Telo ne ustreza shemi.' },
          '401': { description: 'Ključ je neveljaven, preklican ali potekel.' },
          '403': { description: 'Cilj s tem ključem ni dovoljen.' },
        },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'CleverDash — uvoz',
      version: '1.0.0',
      description:
        'Shranjevanje vsebine s spletnih strani v CleverDash. Vsaka operacija shrani en zapis in vrne naslov, na katerem je viden.',
    },
    // Absoluten in iz `PUBLIC_BASE_URL`: Action relativnega izvora nima od kod vzeti.
    servers: [{ url: base }],
    paths,
    components: {
      securitySchemes: {
        // Action to poveže z vrednostjo, ki jo človek vpiše v zavihku Authentication (API Key,
        // Custom header name `X-API-Key`). Ključ v shemi NE sme biti in ga tu tudi ni — shema se
        // kopira in prilepi, ključ pa se vpiše ločeno.
        apiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
      schemas: {
        IngestResult: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['created', 'duplicate'],
              description: '"created" = shranjeno, "duplicate" = že obstaja in nič ni nastalo.',
            },
            target: { type: 'string' },
            id: { type: 'string' },
            title: { type: 'string' },
            url: { type: 'string', description: 'Naslov zapisa; pokaži ga uporabniku.' },
            warnings: {
              type: 'array',
              items: { type: 'string' },
              description: 'Kaj je bilo porezano ali izpuščeno. Če ni prazno, povej uporabniku.',
            },
          },
        },
      },
    },
    security: [{ apiKey: [] }],
  };
}
