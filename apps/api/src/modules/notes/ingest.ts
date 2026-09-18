import { z } from 'zod';
import {
  registerIngestTarget,
  type IngestContext,
  type IngestOutcome,
} from '../../platform/ingest/registry.js';
import {
  deriveTitle,
  MAX_BODY_LENGTH,
  MAX_TAGS,
  MAX_TAG_LENGTH,
  MAX_TITLE_LENGTH,
  normalizeTags,
} from './domain/note-input.js';
import { NoteModel } from './models/note.model.js';
import { NOTE_SCOPES } from './scopes.js';

// Prispevek modula 007 k vstopni točki za agente (`platform/ingest/`). Lega v modulu iz istega
// razloga kot pri 008 in 013 (člen I): uvaža `NoteModel`, zato mora z modulom izginiti.
//
// DVOJNIKA TU NAMENOMA NI — edini od treh ciljev brez te preverbe. Recept in povezavo enolično
// določa naslov strani; beležko ne določa nič. Ujemanje po naslovu bi "Nakupovalni seznam",
// zapisan v torek, razglasilo za dvojnik istoimenskega iz ponedeljka in drugega tiho zavrglo —
// izguba podatka, ki je hujša od podvojene vrstice v seznamu. Kdor beležko pošlje dvakrat, ima
// dve beležki in ju vidi.

const ingestSchema = z
  .object({
    title: z.string().max(MAX_TITLE_LENGTH).optional(),
    body: z.string().max(MAX_BODY_LENGTH).optional(),
    tags: z.array(z.string().max(MAX_TAG_LENGTH)).max(MAX_TAGS).optional(),
  })
  // Naslov in vsebina sta neobvezna VSAK ZASE, a beležka brez obojega je prazen zapis, ki v
  // seznamu izgleda kot napaka. V vmesniku to ujame `assertNotEmpty` po zlitju s starim zapisom;
  // tu zapis vedno nastaja na novo, zato je pogoj lahko kar v shemi in vrne 400 z imenom polja.
  .refine((v) => (v.title ?? '').trim().length > 0 || (v.body ?? '').trim().length > 0, {
    message: 'Beležka potrebuje naslov ali vsebino.',
    path: ['body'],
  });

type NoteIngestInput = z.infer<typeof ingestSchema>;

async function handle(input: NoteIngestInput, ctx: IngestContext): Promise<IngestOutcome> {
  // Isti `deriveTitle` kot `POST /notes`: naslov se izpelje ob PISANJU, da je enak v seznamu, v
  // iskanju in v izvozu. Agent naslova pogosto ne pošlje — prva vrstica vsebine je takrat
  // boljša od praznega imena.
  const title = deriveTitle(input.title ?? '', input.body ?? '');

  const created = await NoteModel.create({
    userId: ctx.userId,
    title,
    body: input.body ?? '',
    tags: normalizeTags(input.tags ?? []),
    // Beležka iz agenta NI pripeta. Pripenjanje je uporabnikova poteza pozornosti in ne sme
    // priti od zunaj — sicer bi zadosti pogost agent na vrh seznama potisnil samo svoje.
    pinned: false,
  });

  return {
    status: 'created',
    id: String(created._id),
    title: created.title,
    path: `/notes/${String(created._id)}`,
  };
}

export function registerNotesIngest(): void {
  registerIngestTarget({
    key: 'notes',
    title: 'Beležke',
    summary: 'Shrani zapisek ali povzetek strani med beležke.',
    scope: NOTE_SCOPES.write,
    schema: ingestSchema,
    handle,
    fields: [
      { name: 'title', type: 'string', required: false, description: 'Naslov beležke. Brez njega vzamem prvo vrstico vsebine.' },
      { name: 'body', type: 'string', required: false, description: 'Vsebina beležke. Nove vrstice pošlji kot \\n.' },
      { name: 'tags', type: 'string[]', required: false, description: 'Oznake za iskanje ("delo", "ideja"). Največ 20.' },
    ],
    example: {
      title: 'Povzetek članka o zimskem kolesarjenju',
      body: 'Gume: 35 mm, tlak 2,5 bara.\nOblačila: tri plasti, veterna zgoraj.\nVir: zurnal24.si',
      tags: ['kolesarjenje', 'povzetek'],
    },
  });
}
