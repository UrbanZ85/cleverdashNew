import { z } from 'zod';
import {
  registerIngestTarget,
  type IngestContext,
  type IngestOutcome,
} from '../../platform/ingest/registry.js';
import {
  deriveLinkTitle,
  MAX_COMMENT_LENGTH,
  MAX_GROUP_NAME_LENGTH,
  MAX_TITLE_LENGTH,
} from './domain/link-input.js';
import { MAX_LINK_URL_LENGTH, normalizeLinkUrl } from './domain/link-url.js';
import { buildSearchText } from './domain/search-text.js';
import { SavedLinkGroupModel } from './models/saved-link-group.model.js';
import { SavedLinkModel } from './models/saved-link.model.js';
import { SAVED_LINK_SCOPES } from './scopes.js';

// Prispevek modula 008 k vstopni točki za agente (`platform/ingest/`). Razlog za lego v modulu in
// ne v `platform/` je isti kot pri receptih: ta datoteka uvaža modelе tega modula, zato mora z
// njim tudi izginiti (člen I).
//
// TRI RAZLIKE DO `POST /saved-links`, vsaka iz narave klicatelja:
//
//  1. STREŽNIK STRANI NE OBIŠČE (`readLinkMetadata` se ne kliče). Agent je stran pravkar prebral
//     in ime pošlje sam; drugo branje bi tujemu strežniku prineslo dva obiska namesto enega
//     (člen VIII). `metadataStatus` zato ostane `skipped` — kar je njegov obstoječi pomen.
//  2. DVOJNIK SE NE USTVARI. V vmesniku je podvojena povezava dovoljena in se samo javi prek
//     `duplicateOfId` (research.md §10), ker je tam odločitev človeka, ki jo vidi. Agent
//     opozorila ne vidi in bi ob vsaki ponovitvi dodal še eno vrstico.
//  3. MAPA SE IZBERE PO IMENU, ne po identifikatorju — agent identifikatorjev nima in jih ne more
//     dobiti. Mapa se pri tem NE ustvari: ustvarjanje map je razvrščanje, torej uporabnikova
//     odločitev, in agent, ki se zmoti v imenu, bi sicer knjižnico posejal s praznimi mapami.

const ingestSchema = z.object({
  url: z.string().min(1).max(MAX_LINK_URL_LENGTH),
  title: z.string().max(MAX_TITLE_LENGTH).optional(),
  comment: z.string().max(MAX_COMMENT_LENGTH).nullish(),
  group: z.string().trim().max(MAX_GROUP_NAME_LENGTH).nullish(),
  allowDuplicate: z.boolean().default(false),
});

type LinkIngestInput = z.infer<typeof ingestSchema>;

async function handle(input: LinkIngestInput, ctx: IngestContext): Promise<IngestOutcome> {
  const warnings: string[] = [];

  // Neveljaven naslov je tu ZAVRNITEV in ne opozorilo (za razliko od recepta): shranjena stran
  // brez naslova ni okrnjen zapis, ampak zapis brez vsebine — `url` je edino obvezno polje tega
  // modula in brez njega ni česa odpreti.
  const normalized = normalizeLinkUrl(input.url);
  if (!normalized.ok) {
    throw new z.ZodError([
      { code: 'custom', path: ['url'], message: normalized.message },
    ]);
  }
  const url = normalized.url;

  if (!input.allowDuplicate) {
    const existing = await SavedLinkModel.findOne({ userId: ctx.userId, url })
      .select('_id title')
      .lean();
    if (existing) {
      return {
        status: 'duplicate',
        id: String(existing._id),
        title: existing.title,
        path: '/saved-links',
      };
    }
  }

  let groupId: string | null = null;
  if (input.group) {
    // Ujemanje brez razlikovanja velikih črk in z ubežnimi znaki: agent "delo" in uporabnikova
    // mapa "Delo" sta ista mapa, `(` v imenu pa ne sme razbiti regularnega izraza.
    const escaped = input.group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const group = await SavedLinkGroupModel.findOne({
      userId: ctx.userId,
      name: { $regex: `^${escaped}$`, $options: 'i' },
    })
      .select('_id')
      .lean();
    if (group) {
      groupId = String(group._id);
    } else {
      warnings.push(`Mape "${input.group}" ni — zapis je med nerazvrščenimi.`);
    }
  }

  // Nov zapis gre na VRH svoje mape (FR-033) — isto pravilo kot v `POST /saved-links`, sicer bi
  // zapisi iz agenta pristajali drugje kot zapisi iz vmesnika.
  const topmost = await SavedLinkModel.findOne({ userId: ctx.userId, groupId })
    .sort({ order: 1 })
    .select('order')
    .lean();
  const order = topmost ? topmost.order - 1 : 0;

  const title = deriveLinkTitle(input.title, url);
  const comment = input.comment ?? null;

  const created = await SavedLinkModel.create({
    userId: ctx.userId,
    url,
    title,
    // `manual`, ker ime prihaja od agenta in ne iz našega branja strani. S tem ga poznejša
    // osvežitev metapodatkov v vmesniku NE povozi (FR-014) — kar je pravilno: agent je stran
    // prebral, mi pa ne.
    titleSource: (input.title ?? '').trim().length > 0 ? 'manual' : 'auto',
    comment,
    icon: null,
    groupId,
    order,
    searchText: buildSearchText({ title, url, comment }),
    metadataStatus: 'skipped',
  });

  return {
    status: 'created',
    id: String(created._id),
    title: created.title,
    path: '/saved-links',
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

export function registerSavedLinksIngest(): void {
  registerIngestTarget({
    key: 'saved-links',
    title: 'Shranjene povezave',
    summary: 'Shrani spletno stran v knjižnico povezav.',
    scope: SAVED_LINK_SCOPES.write,
    schema: ingestSchema,
    handle,
    fields: [
      { name: 'url', type: 'string', required: true, description: 'Naslov strani, ki jo shranjujem.' },
      { name: 'title', type: 'string', required: false, description: 'Naslov strani. Brez njega vzamem ime gostitelja.' },
      { name: 'comment', type: 'string', required: false, description: 'Kratek povzetek v enem ali dveh stavkih, zakaj je stran zanimiva.' },
      { name: 'group', type: 'string', required: false, description: 'Ime OBSTOJEČE mape. Nove ne ustvarim — neznano ime pristane med nerazvrščenimi.' },
    ],
    example: {
      url: 'https://www.zurnal24.si/clanek',
      title: 'Kako pravilno zimsko kolesariti',
      comment: 'Nasveti za gume in oblačila pod lediščem.',
      group: 'Kolesarjenje',
    },
  });
}
