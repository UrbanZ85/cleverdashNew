import { describe, expect, it } from 'vitest';
import { HELP_TOPICS, helpTopic, type HelpTopicId } from '../../src/app/shared/help/help-topics.js';

// Pojasnila so vsebina, ne koda — a prazno ali polovično pojasnilo je slabše od nobenega,
// ker uporabnik odpre okno in v njem ne najde odgovora. Ta test drži obliko.
//
// Da ključ, ki ga uporabi predloga, sploh obstaja, skrbi tip `HelpTopicId` (Angularjevo
// strogo preverjanje predlog) — tega tu ni treba preverjati znova.

const entries = Object.entries(HELP_TOPICS) as Array<[HelpTopicId, (typeof HELP_TOPICS)[HelpTopicId]]>;

describe('katalog pojasnil', () => {
  it('ni prazen', () => {
    expect(entries.length).toBeGreaterThan(10);
  });

  it.each(entries)('%s ima naslov, opis in vsaj en korak', (_id, topic) => {
    expect(topic.title.trim().length).toBeGreaterThan(0);
    expect(topic.what.trim().length).toBeGreaterThan(20);
    expect(topic.how.length).toBeGreaterThan(0);
    expect(topic.how.every((step) => step.trim().length > 0)).toBe(true);
  });

  it.each(entries)('%s nima podvojenih korakov', (_id, topic) => {
    expect(new Set(topic.how).size).toBe(topic.how.length);
  });

  it('naslovi so slovenski, ne identifikatorji (člen X)', () => {
    for (const [id, topic] of entries) {
      expect(topic.title).not.toBe(id);
      expect(topic.title).not.toMatch(/^[a-z]+\.[a-zA-Z]+$/);
    }
  });

  it('helpTopic vrne isti zapis kot neposredni dostop', () => {
    expect(helpTopic('plugin.url')).toBe(HELP_TOPICS['plugin.url']);
  });

  it('pojasnilo za naslov vira našteje vsa tri varovala', () => {
    // Pravilo je varnostno (domain/outbound-url.ts) in mora biti uporabniku razvidno,
    // preden dobi zavrnitev s strežnika.
    const how = HELP_TOPICS['plugin.url'].how.join(' ');
    expect(how).toContain('https');
    expect(how).toMatch(/gesla|poverilnic/i);
    expect(how).toMatch(/lokalno|zasebno/i);
  });
});
