// Čist podatkovni model in logika modula "Shranjeni linki" — BREZ uvozov iz @angular/*, da
// je preverljiva z enotnimi testi brez TestBed-a (isti vzorec kot core/settings/settings.model.ts
// in features/notes/notes.model.ts).
//
// Oblike se ujemajo s specs/008-saved-links/contracts/openapi.yaml. Ročno prepisane in ne
// generirane: `packages/contracts` sicer generira tipe (`saved-links.d.ts`), a jih do zdaj ne
// uvaža noben odjemalec — isti dogovor kot v features/todos/todos.model.ts.

/** `manual` = ime je vpisal uporabnik in samodejno branje ga ne sme prepisati (FR-014). */
export type TitleSource = 'manual' | 'auto';

/** Izid zadnjega branja strani. `skipped` pomeni, da strežnik strani NI obiskal (naslov ni
 * prestal varovala odhodnih naslovov) — to NI napaka (research.md §5). */
export type MetadataStatus = 'ok' | 'skipped' | 'failed';

export interface SavedLink {
  id: string;
  url: string;
  title: string;
  titleSource: TitleSource;
  comment: string | null;
  icon: string | null;
  /** Ali je favicon razrešen. Samega naslova favicona odjemalec NE dobi — bajti gredo prek
   * `/saved-links/{id}/favicon`, da brskalnik tujega gostitelja ne kliče (člen VIII, SC-005). */
  hasFavicon: boolean;
  groupId: string | null;
  order: number;
  metadataStatus: MetadataStatus;
  metadataFetchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatedSavedLink extends SavedLink {
  /** ID obstoječega zapisa z istim normaliziranim naslovom, sicer `null`. Ni napaka —
   * dvojnik je dovoljen (FR-005), vmesnik nanj samo opozori. */
  duplicateOfId: string | null;
}

export interface SavedLinkGroup {
  id: string;
  name: string;
  order: number;
  collapsed: boolean;
  /** Koliko zapisov je v mapi — da potrditev brisanja pove, kaj se bo premaknilo (FR-022). */
  linkCount: number;
}

export interface SavedLinkDraft {
  url: string;
  title?: string;
  comment?: string | null;
  icon?: string | null;
  groupId?: string | null;
}

/** Nadomestna ikona na koncu vrste prednosti (research.md §9). */
export const FALLBACK_LINK_ICON = 'link-outline';

/**
 * Kaj se izriše kot ikona zapisa. Vrstni red prednosti je izrecna odločitev (research.md §9):
 * uporabnikova izbira → favicon → nadomestna ikona.
 *
 * Vrne `null` za "uporabi favicon", ker je favicon slika (`<img>`) in ne ikona (`<ion-icon>`)
 * — klicatelj mora izrisati drug element, ne drugo ime.
 */
export function linkIconName(link: SavedLink): string | null {
  if (link.icon) return link.icon;
  if (link.hasFavicon) return null;
  return FALLBACK_LINK_ICON;
}

/** Ali se za ta zapis izriše favicon (in ne ikona). */
export function usesFavicon(link: SavedLink): boolean {
  return !link.icon && link.hasFavicon;
}

/**
 * Slovensko besedilo značke stanja metapodatkov (člen X: vrednosti so angleški
 * identifikatorji, preslikava v vmesnik je ločena).
 *
 * `ok` NIMA značke: značka, ki je vedno prisotna, ne pomeni nič (člen VII). Prav tako
 * manjkajoč favicon ni napaka in se ne javlja.
 */
export function metadataBadge(link: SavedLink): { text: string; color: string; hint: string } | null {
  if (link.metadataStatus === 'skipped') {
    return {
      text: 'ni prebrano',
      color: 'medium',
      hint: 'Naslov kaže v zasebno omrežje ali vsebuje poverilnice, zato strežnik strani ni obiskal. Zapis je vseeno veljaven.',
    };
  }
  if (link.metadataStatus === 'failed') {
    return {
      text: 'strani ni bilo mogoče prebrati',
      color: 'warning',
      hint: 'Stran ni odgovorila v proračunu, ni vrnila HTML ali je nedosegljiva. Zapis je shranjen; poskusi "Osveži podatke strani".',
    };
  }
  return null;
}

/** Gostitelj brez `www.` — pod imenom zapisa je bolj berljiv od celega naslova. */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Zapisi, razvrščeni po mapah, v vrstnem redu map — oblika, ki jo seznam izriše neposredno.
 * Nerazvrščeni so VEDNO svoj razdelek in nikoli skriti (FR-021).
 *
 * Čista funkcija in ne getter v komponenti, ker je to edina netrivialna preslikava na tem
 * zaslonu in mora biti testabilna brez TestBed-a.
 */
export interface LinkSection {
  group: SavedLinkGroup | null;
  links: SavedLink[];
}

export function groupLinks(links: readonly SavedLink[], groups: readonly SavedLinkGroup[]): LinkSection[] {
  const byGroup = new Map<string | null, SavedLink[]>();
  for (const link of links) {
    const key = link.groupId;
    const bucket = byGroup.get(key);
    if (bucket) bucket.push(link);
    else byGroup.set(key, [link]);
  }

  const sections: LinkSection[] = [];
  for (const group of [...groups].sort((a, b) => a.order - b.order)) {
    sections.push({ group, links: byGroup.get(group.id) ?? [] });
  }

  // Nerazvrščeni gredo na KONEC in se pokažejo tudi, kadar so prazni in map še ni — sicer bi
  // uporabnik brez map videl prazen zaslon, čeprav zapise ima.
  const ungrouped = byGroup.get(null) ?? [];
  if (ungrouped.length > 0 || sections.length === 0) {
    sections.push({ group: null, links: ungrouped });
  }
  return sections;
}
