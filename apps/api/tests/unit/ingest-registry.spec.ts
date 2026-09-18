import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ingestTargetKeys,
  listIngestTargets,
  registerIngestTarget,
  resetIngestTargetsForTests,
} from '../../src/platform/ingest/registry.js';
import { registerRecipesIngest } from '../../src/modules/recipes/ingest.js';
import { registerSavedLinksIngest } from '../../src/modules/saved-links/ingest.js';
import { registerNotesIngest } from '../../src/modules/notes/ingest.js';

// Register je čista koda in se testira brez baze in brez strežnika (člen IX). Registracija
// cilja ne piše nikamor — šele `handle()` bi, in tega tu ne kličemo.

beforeEach(resetIngestTargetsForTests);
afterEach(resetIngestTargetsForTests);

function registerAll(): void {
  registerRecipesIngest();
  registerSavedLinksIngest();
  registerNotesIngest();
}

describe('register ciljev uvoza', () => {
  it('cilj se registrira in najde po ključu', () => {
    registerAll();
    expect(ingestTargetKeys()).toEqual(['notes', 'recipes', 'saved-links']);
  });

  it('vrstni red je abecedni in ni odvisen od vrstnega reda registracij', () => {
    // Če bi seznam sledil vrstnemu redu klicev v main.ts, bi se besedilo navodila premešalo ob
    // vsaki preureditvi tistih vrstic — in razlika bi se pokazala šele v prilepljenem besedilu.
    registerNotesIngest();
    registerRecipesIngest();
    registerSavedLinksIngest();
    const first = ingestTargetKeys();

    resetIngestTargetsForTests();
    registerSavedLinksIngest();
    registerNotesIngest();
    registerRecipesIngest();

    expect(ingestTargetKeys()).toEqual(first);
  });

  it('ponovna registracija istega ključa zamenja vnos in ga ne podvoji', () => {
    // `createApp()` se v testih kliče večkrat v istem procesu. Dva vnosa za `recipes` bi
    // pomenila dva cilja z istim imenom.
    registerRecipesIngest();
    registerRecipesIngest();
    expect(ingestTargetKeys().filter((k) => k === 'recipes')).toHaveLength(1);
  });

  it('odstranitev modula pusti register uporaben za ostale cilje (člen I)', () => {
    // Posnetek stanja "mapa modules/recipes/ je izbrisana": njegove registracije ni.
    registerSavedLinksIngest();
    registerNotesIngest();

    expect(ingestTargetKeys()).toEqual(['notes', 'saved-links']);
    expect(listIngestTargets().every((t) => t.fields.length > 0)).toBe(true);
  });
});

describe('primeri v navodilu so veljavni po lastni shemi cilja', () => {
  // NAJPOMEMBNEJŠI TEST V TEJ DATOTEKI. Primer iz `example` gre DOBESEDNO v besedilo, ki ga
  // uporabnik prilepi agentu — agent ga prepiše in pošlje. Primer, ki ga lastna shema zavrne, je
  // torej navodilo, ki agenta uči obliko, na katero strežnik odgovori 400; napaka pa se pokaže
  // pri uporabniku v tujem pogovornem oknu, kjer je noben dnevnik ne pojasni.
  it.each(['recipes', 'saved-links', 'notes'])('%s', (key) => {
    registerAll();
    const target = listIngestTargets().find((t) => t.key === key)!;
    expect(() => target.schema.parse(target.example)).not.toThrow();
  });

  it('vsako OBVEZNO polje je v primeru tudi zares prisotno', () => {
    registerAll();
    for (const target of listIngestTargets()) {
      for (const field of target.fields.filter((f) => f.required)) {
        expect(
          Object.keys(target.example),
          `cilj "${target.key}": obvezno polje "${field.name}" manjka v primeru`,
        ).toContain(field.name);
      }
    }
  });

  it('vsako polje v primeru je tudi opisano v navodilu', () => {
    // Obratna smer: polje, ki je v primeru, a ni v `fields`, bi ga agent videl brez pojasnila,
    // kaj vanj sodi — in bi ga pri drugi strani izpustil ali izmislil.
    registerAll();
    for (const target of listIngestTargets()) {
      const documented = target.fields.map((f) => f.name);
      for (const name of Object.keys(target.example)) {
        expect(documented, `cilj "${target.key}": polje "${name}" iz primera ni opisano`).toContain(name);
      }
    }
  });
});

describe('obseg cilja', () => {
  it('vsak cilj zahteva obseg za PISANJE svojega modula', () => {
    // Cilj brez obsega ali z bralnim obsegom bi pomenil, da vstopna točka za agente piše mimo
    // avtorizacije, ki velja za vse ostale poti.
    registerAll();
    const scopes = Object.fromEntries(listIngestTargets().map((t) => [t.key, t.scope]));
    expect(scopes).toEqual({
      recipes: 'recipes:write',
      'saved-links': 'saved-links:write',
      notes: 'notes:write',
    });
  });

  it('noben cilj ne zahteva obsega admin', () => {
    registerAll();
    expect(listIngestTargets().some((t) => t.scope === 'admin')).toBe(false);
  });
});

describe('shema cilja zavrne nesmiseln vnos', () => {
  it('recept brez naslova', () => {
    registerRecipesIngest();
    const recipes = listIngestTargets().find((t) => t.key === 'recipes')!;
    expect(() => recipes.schema.parse({ ingredients: ['moka'] })).toThrow();
  });

  it('beležka brez naslova in brez vsebine', () => {
    registerNotesIngest();
    const notes = listIngestTargets().find((t) => t.key === 'notes')!;
    expect(() => notes.schema.parse({ tags: ['delo'] })).toThrow();
    expect(() => notes.schema.parse({ title: '   ', body: '' })).toThrow();
    expect(() => notes.schema.parse({ body: 'nekaj' })).not.toThrow();
  });

  it('povezava brez naslova strani', () => {
    registerSavedLinksIngest();
    const links = listIngestTargets().find((t) => t.key === 'saved-links')!;
    expect(() => links.schema.parse({ title: 'brez naslova' })).toThrow();
  });
});

describe('cilj, ki ga prispeva poljuben modul', () => {
  it('register ne pozna nobenega modula vnaprej', () => {
    // Dokaz trditve iz registry.ts: v `platform/ingest/` ni seznama ciljev. Izmišljen cilj se
    // registrira enako kot pravi, brez ene same spremembe v platform/.
    resetIngestTargetsForTests();
    registerIngestTarget({
      key: 'izmisljeni',
      title: 'Izmišljeni',
      summary: 'Cilj, ki ga ta koda ne pozna.',
      scope: 'izmisljeni:write',
      fields: [],
      example: {},
      schema: { parse: (v: unknown) => v } as never,
      handle: async () => ({ status: 'created', id: 'x', title: 'x', path: '/x' }),
    });
    expect(ingestTargetKeys()).toEqual(['izmisljeni']);
  });
});
