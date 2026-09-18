import { describe, expect, it } from 'vitest';
import {
  markPresence,
  referencedCollections,
  STORAGE_SOURCES,
  USERS_COLLECTION,
} from '../../src/modules/analytics/domain/storage-sources.js';
// Ti uvozi so v TESTU dovoljeni in v modulu ne bi bili: pravilo `cleverdash/module-boundary`
// (eslint.config.js) velja za datoteke pod `src/modules/<ime>/`, ne za teste. Prav to je tudi
// smisel te datoteke — modul zbirke bere po IMENU, ker modelov ne sme uvoziti, test pa oboje vidi
// hkrati in lahko preveri, da se ujemata.
import { RecipeImageModel } from '../../src/modules/recipes/models/recipe-image.model.js';
import { RecipeModel } from '../../src/modules/recipes/models/recipe.model.js';
import { NoteAudioModel } from '../../src/modules/notes/models/note-audio.model.js';
import { NoteModel } from '../../src/modules/notes/models/note.model.js';
import { SharedFileModel } from '../../src/modules/file-sharing/models/shared-file.model.js';
import { UserModel } from '../../src/modules/auth/models/user.model.js';

// VAROVALO PREPISA (research.md §2).
//
// `modules/analytics/domain/storage-sources.ts` nosi imena zbirk kot navadne nize, ker uvoz
// modela tujega modula prepoveduje člen I. Nizov prevajalnik ne varuje: preimenovanje modela v
// modulu 013 bi pustilo analitiko brez napake in s tihimi ničlami — natanko okvara, ki jo člen VII
// prepoveduje. Ta test je edina mreža pod tem in se ob taki spremembi pokvari, kar je njegov namen.

const EXPECTED_COLLECTIONS: Record<string, string> = {
  recipeimages: RecipeImageModel.collection.name,
  recipes: RecipeModel.collection.name,
  noteaudios: NoteAudioModel.collection.name,
  notes: NoteModel.collection.name,
  sharedfiles: SharedFileModel.collection.name,
  users: UserModel.collection.name,
};

describe('tabela virov — imena zbirk se ujemajo z resničnimi', () => {
  it('vsako ime iz tabele obstaja kot zbirka kakšnega modela', () => {
    const real = new Set(Object.values(EXPECTED_COLLECTIONS));
    for (const name of referencedCollections()) {
      expect(real, `zbirka "${name}" iz tabele virov ne ustreza nobenemu modelu`).toContain(name);
    }
  });

  it('vsak prepisan niz je enak imenu zbirke svojega modela', () => {
    for (const [written, real] of Object.entries(EXPECTED_COLLECTIONS)) {
      expect(written).toBe(real);
    }
  });

  it('zbirka uporabnikov je navedena posebej in je med branimi', () => {
    expect(USERS_COLLECTION).toBe(UserModel.collection.name);
    expect(referencedCollections()).toContain(USERS_COLLECTION);
  });

  it('identifikatorji virov so enolični in se ujemajo s pogodbo', () => {
    const ids = STORAGE_SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(
      ['note-audio', 'notes', 'recipe-images', 'recipes', 'shared-files', 'shared-files-received'].sort(),
    );
  });

  it('vsak vir ima slovensko ime za prikaz (člen X)', () => {
    for (const source of STORAGE_SOURCES) {
      expect(source.label.length).toBeGreaterThan(0);
      expect(source.label).not.toBe(source.id);
    }
  });

  it('dva vira nad isto zbirko se ločita z `match` in se ne prekrivata', () => {
    // `shared-files` in `shared-files-received` sta nad `sharedfiles`. Brez ločila bi bili
    // prejete datoteke štete dvakrat in skupna vsota bi bila napačna.
    const shared = STORAGE_SOURCES.filter((s) => s.collection === 'sharedfiles');
    expect(shared).toHaveLength(2);
    for (const source of shared) expect(source.match).toBeDefined();
    expect(shared[0]!.match).not.toEqual(shared[1]!.match);
  });
});

describe('markPresence — vir, ki ga v namestitvi ni (FR-012)', () => {
  it('označi za odsotne vse, katerih zbirke ni, in jih NE izpusti', () => {
    // Vrstica mora ostati: razlika med "ni vsebine" in "ni modula" je za administratorja pomembna.
    const marked = markPresence(STORAGE_SOURCES, ['sharedfiles', 'users']);
    expect(marked).toHaveLength(STORAGE_SOURCES.length);
    expect(marked.filter((s) => s.present).map((s) => s.id).sort()).toEqual(
      ['shared-files', 'shared-files-received'].sort(),
    );
  });

  it('ob praznem seznamu zbirk ni prisoten noben vir in to ni napaka', () => {
    const marked = markPresence(STORAGE_SOURCES, []);
    expect(marked.every((s) => !s.present)).toBe(true);
  });
});
