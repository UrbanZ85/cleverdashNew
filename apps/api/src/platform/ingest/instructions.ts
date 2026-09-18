import type { IngestField, IngestTarget } from './registry.js';

// Navodilo, ki ga uporabnik PRILEPI v ChatGPT (ali v katerega koli agenta), da ta zna pisati v
// to namestitev.
//
// ZAKAJ GA SESTAVLJA STREŽNIK IN NE ČLOVEK. Navodilo je opis pogodbe: naslov, glava, imena polj,
// kaj je obvezno. Če ga piše človek, se od pogodbe razide ob PRVI spremembi polja — in razide se
// tiho, ker navodilo živi v zgodovini pogovora z agentom, kjer ga noben test ne vidi. Tu je
// izpeljano iz istega registra, ki mu strežnik dejansko streže, zato novo polje v cilju pomeni
// novo vrstico v navodilu brez enega popravka tukaj.
//
// Besedilo je NAMENOMA golo (brez Markdowna, brez okraskov): prilepi se v pogovorno okno, kjer
// vsak znak stane, agentu pa koristi zgradba, ne oblikovanje. Slovensko, ker je uporabnikovo
// (člen X).

export interface InstructionsInput {
  /** Izvor namestitve iz `PUBLIC_BASE_URL`, brez zaključne poševnice. */
  baseUrl: string;
  /** Čistopis ključa ob nastanku, ali `null` pri poznejšem branju — ključ ni obnovljiv, zato
   * navodilo takrat vsebuje nadomestek in ne izmišljene vrednosti. */
  secret: string | null;
  /** Cilji, ki jih ta ključ sme uporabiti. Vsaj eden; brez njih ključ ne bi imel kaj početi. */
  targets: readonly IngestTarget<never>[];
  expiresAt: Date | null;
}

/** Nadomestek namesto ključa, kadar čistopisa ni več. Oglati oklepaji in velike črke zato, da je
 * v prilepljenem besedilu OČITNO, da to ni ključ — človek mora videti, kaj mora zamenjati. */
const SECRET_PLACEHOLDER = '<TVOJ-KLJUC>';

const TYPE_LABEL: Record<IngestField['type'], string> = {
  string: 'besedilo',
  'string[]': 'seznam besedil',
  number: 'število',
  boolean: 'da/ne',
};

/**
 * Datum po slovensko, v domačem časovnem pasu.
 *
 * NE prek `toISOString()` — člen V.4: koledarski dan se v tej kodni bazi nikoli ne računa prek
 * UTC, in "velja do 1. 1." namesto "do 31. 12." je natanko tista napaka za eno uro, ki jo ta člen
 * prepoveduje.
 *
 * ŠTEVILČNO in ne `dateStyle: 'long'`: ta da ime meseca v imenovalniku ("17. december 2026"),
 * stavek okoli njega pa terja rodilnik ("velja do 17. decembra 2026"). `Intl` sklona ne pozna,
 * lastna preglednica sklanjatev pa bi bila dvanajst vrstic za en sam stavek. Številčni zapis je
 * slovnično nevtralen in enako nedvoumen.
 */
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('sl-SI', {
    timeZone: 'Europe/Ljubljana',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).format(date);
}

/** Vrstica ene lastnosti v opisu polj. Poravnava je v presledkih in ne v tabeli, ker se navodilo
 * prilepi kot golo besedilo in bi se tabela tam razlezla. */
function fieldLine(field: IngestField): string {
  const name = field.name.padEnd(14, ' ');
  const type = TYPE_LABEL[field.type].padEnd(16, ' ');
  const required = field.required ? 'OBVEZNO  ' : '         ';
  return `  ${name}${type}${required}${field.description}`;
}

function targetBlock(target: IngestTarget<never>, only: boolean): string {
  const lines: string[] = [];
  lines.push(`CILJ "${target.key}" — ${target.title}`);
  lines.push(`  ${target.summary}`);
  lines.push('');
  lines.push('  Polja:');
  for (const field of target.fields) lines.push(`  ${fieldLine(field)}`);
  lines.push('');
  lines.push('  Primer celotnega telesa zahteve:');
  // Primer se izpiše kot POPOLNO telo (z ovojnico `target`/`data`) in ne kot gola vsebina.
  // Agent prepiše tisto, kar vidi — primer brez ovojnice je zanesljiva pot do zahteve, ki jo
  // strežnik zavrne s 400, človek pa ne ve, zakaj.
  const example = JSON.stringify({ target: target.key, data: target.example }, null, 2);
  for (const line of example.split('\n')) lines.push(`  ${line}`);
  if (!only) lines.push('');
  return lines.join('\n');
}

/**
 * Sestavi celotno navodilo.
 *
 * Zgradba sledi vrstnemu redu, po katerem agent dela: KAJ naredi, KAM pošlje, KAKO izgleda telo,
 * ČESA ne sme, KAJ pomeni odgovor. Pravila so na koncu in ne na začetku, ker jih agent prebere
 * tik pred tem, ko sestavi telo.
 */
export function buildIngestInstructions(input: InstructionsInput): string {
  const secret = input.secret ?? SECRET_PLACEHOLDER;
  const endpoint = `${input.baseUrl.replace(/\/+$/, '')}/api/v1/ingest`;
  const only = input.targets.length === 1;
  const first = input.targets[0];

  const lines: string[] = [];

  lines.push('NAVODILO ZA SHRANJEVANJE V CLEVERDASH');
  lines.push('');
  lines.push(
    'Ko ti pošljem naslov strani, jo odpri in preberi. Iz nje izlušči podatke in jih shrani v',
  );
  lines.push('CleverDash s spodnjo zahtevo. Nič drugega ne počni, dokler ti ne rečem.');
  lines.push('');

  lines.push('ZAHTEVA');
  lines.push(`  POST ${endpoint}`);
  lines.push(`  X-API-Key: ${secret}`);
  lines.push('  Content-Type: application/json');
  lines.push('');

  lines.push('OBLIKA TELESA');
  lines.push('  {');
  // Kadar je cilj en sam, je `target` neobvezen (glej router.ts). V navodilu ostane izpisan:
  // izrecna vrednost je za agenta enoumna, izpuščeno polje pa povabilo k ugibanju.
  lines.push(`    "target": "${first ? first.key : '...'}",`);
  lines.push('    "data": { ... }');
  lines.push('  }');
  lines.push('');
  if (!only) {
    lines.push(
      `  "target" pove, kam gre zapis. Izberi enega od: ${input.targets.map((t) => `"${t.key}"`).join(', ')}.`,
    );
    lines.push('  V eni zahtevi je natanko en cilj.');
    lines.push('');
  }
  lines.push('  "data" sme biti tudi SEZNAM objektov, če hočem shraniti več stvari naenkrat.');
  lines.push('');

  for (const target of input.targets) lines.push(targetBlock(target, only));
  lines.push('');

  lines.push('PRAVILA');
  lines.push('  1. Ne izmišljuj si podatkov. Polje, ki ga na strani ni, preprosto izpusti —');
  lines.push('     nikoli ne pošlji ugibanja, praznega niza ali besede "neznano".');
  lines.push('  2. Besedilo prepiši v jeziku strani. Ne prevajaj in ne preoblikuj po svoje.');
  lines.push('  3. Pošlji NAVADEN JSON, brez ovojnice ```json in brez komentarjev.');
  lines.push('  4. Pošlji natanko eno zahtevo. Če odgovor ni napaka omrežja, NE poskušaj znova.');
  lines.push('  5. Ključa iz tega navodila ne izpiši, ne ponovi in ne pokaži nikomur.');
  lines.push('');

  lines.push('ODGOVOR');
  lines.push('  201 — shranjeno. V odgovoru je "url"; pošlji mi ga.');
  lines.push('  200 s "status": "duplicate" — to je že shranjeno od prej. Povej mi to in');
  lines.push('      pošlji "url" obstoječega zapisa. Ne poskušaj znova.');
  lines.push('  4xx — v odgovoru je "detail". Dobesedno mi ga povej in ne poskušaj znova.');
  lines.push('  V odgovoru je lahko tudi "warnings" — če je, mi ga povej.');
  lines.push('');

  lines.push('VELJAVNOST KLJUČA');
  lines.push(
    input.expiresAt
      ? `  Ključ velja do ${formatDate(input.expiresAt)}. Po tem bo odgovor 401 in mi to povej.`
      : '  Ključ nima roka veljavnosti.',
  );

  return lines.join('\n');
}

/**
 * Isti klic kot `curl` — za preizkus brez agenta.
 *
 * Obstaja zato, ker je prvo vprašanje ob vsakem novem ključu "ali sploh dela?", in nanj se ne
 * odgovarja tako, da se preizkusi agent. Če ta vrstica vrne 201, je narobe navodilo; če vrne
 * 401, je narobe ključ. Brez te ločnice se to dvoje ne da razločiti.
 */
export function buildCurlExample(input: InstructionsInput): string {
  const secret = input.secret ?? SECRET_PLACEHOLDER;
  const endpoint = `${input.baseUrl.replace(/\/+$/, '')}/api/v1/ingest`;
  const target = input.targets[0];
  if (!target) return '';
  const body = JSON.stringify({ target: target.key, data: target.example });
  return [
    `curl -X POST ${endpoint} \\`,
    `  -H "X-API-Key: ${secret}" \\`,
    '  -H "Content-Type: application/json" \\',
    `  -d '${body.replace(/'/g, `'\\''`)}'`,
  ].join('\n');
}
