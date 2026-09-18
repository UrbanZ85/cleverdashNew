// Oblike, ki jih vrača `/api/v1/recipes*`. Prepisane iz pogodbe
// (specs/013-recipes/contracts/openapi.yaml), ne generirane — enak dogovor kot pri modulih 008 in
// 010.

export const MEMBER_ROLES = ['view', 'edit'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Besedilo ob vlogi v izbirniku. Loči, kaj vloga DA, ne kako se imenuje — "ogled" in "urejanje"
 * sama po sebi ne povesta, ali sme soudeleženec označiti recept za skuhanega. */
export const ROLE_LABELS: Record<MemberRole, string> = {
  view: 'Samo ogled',
  edit: 'Urejanje',
};

export const ROLE_HINTS: Record<MemberRole, string> = {
  view: 'Recept vidi in ga lahko skuha, ne more pa spremeniti ničesar.',
  edit: 'Lahko popravi vsebino, doda slike in označi, da je bilo skuhano. Deljenja in brisanja ne.',
};

export interface PersonSummary {
  id: string;
  displayName: string;
  initials: string;
}

export interface RecipeMember extends PersonSummary {
  role: MemberRole;
  addedAt: string;
  seenAt: string | null;
}

/** Kaj klicatelj sme. Prihaja s STREŽNIKA in se NE izpeljuje iz vloge na odjemalcu (člen XI):
 * vmesnik, ki bi sklepal sam, bi se prej ali slej zmotil v smer, ki pokaže gumb, ki vrne 403. */
export interface RecipeCapabilities {
  readRecipe: boolean;
  editRecipe: boolean;
  manageImages: boolean;
  markCooked: boolean;
  rateRecipe: boolean;
  deleteRecipe: boolean;
  manageSharing: boolean;
  managePublicLink: boolean;
  leaveRecipe: boolean;
}

/** Izid branja izvorne strani. `none` = recept nima naslova, in to NI napaka. */
export type SourceStatus = 'none' | 'ok' | 'skipped' | 'failed';

export interface Recipe {
  id: string;
  title: string;
  url: string | null;
  sourceHost: string | null;
  description: string | null;
  ingredients: string[];
  steps: string[];
  prepMinutes: number | null;
  servings: number | null;
  tags: string[];
  /** Kategorije ("Juhe", "Kosila") kot IMENA, ne identifikatorji — recept vidita dva uporabnika
   * z dvema različnima besednjakoma, zato bi identifikator za soudeleženca kazal v tujo zbirko. */
  categories: string[];
  rating: number | null;
  lastCookedAt: string | null;
  cookCount: number;
  coverImageId: string | null;
  imageCount: number;
  sourceStatus: SourceStatus;
  sourceFetchedAt: string | null;
  isOwn: boolean;
  owner: PersonSummary | null;
  members: RecipeMember[];
  /** Soudeleženec recepta še ni odprl (FR-038). Za lastnika vedno `false`. */
  isNew: boolean;
  publicLink: { url: string; createdAt: string } | null;
  lastModifiedBy: PersonSummary | null;
  capabilities: RecipeCapabilities;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeImage {
  id: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  hasThumb: boolean;
  caption: string | null;
  isCover: boolean;
  createdAt: string;
}

export interface RecipeDraft {
  title: string;
  url?: string | null;
  description?: string | null;
  ingredients?: string[];
  steps?: string[];
  prepMinutes?: number | null;
  servings?: number | null;
  tags?: string[];
  categories?: string[];
  rating?: number | null;
  importFromUrl?: boolean;
}

/** Vnos v uporabnikovem besednjaku kategorij. Besednjak je ZASEBEN in ločen od imen, zapisanih v
 * receptih — recept lahko nosi kategorijo, ki je v besednjaku ni (npr. jo je dodal soudeleženec). */
export interface RecipeCategory {
  id: string;
  name: string;
  key: string;
  order: number;
  /** Koliko LASTNIH receptov nosi to kategorijo — vmesnik iz tega pove, kaj bo izgubljeno ob
   * izbrisu. */
  recipeCount: number;
}

export type RecipeSort = 'recent' | 'title' | 'rating' | 'cooked';
export type RecipeScope = 'all' | 'own' | 'shared';

export const SORT_LABELS: Record<RecipeSort, string> = {
  recent: 'Nazadnje spremenjeni',
  title: 'Po imenu',
  rating: 'Po oceni',
  cooked: 'Že dolgo ne',
};

/** Kaj pomeni izid branja izvorne strani — za uporabnika, ne za dnevnik (člen VI).
 * `null` pomeni "ni česa povedati" in vmesnik takrat ne izriše ničesar. */
export function describeSourceStatus(status: SourceStatus): string | null {
  switch (status) {
    case 'none':
    case 'ok':
      return null;
    case 'skipped':
      return 'Strani nismo obiskali — njen naslov ni prestal varnostne preverbe (npr. ni https).';
    case 'failed':
      return 'Strani ni bilo mogoče prebrati. Vsebino lahko vpišeš ročno ali poskusiš znova.';
  }
}

/** "1 h 30 min" iz minut. Prazno za `null`, ker je "brez podatka" veljavno stanje in bi "0 min"
 * bilo trditev, ki je nihče ni vpisal. */
export function formatDuration(minutes: number | null): string {
  if (minutes === null || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

/**
 * "Nazadnje: pred 3 tedni" oz. "Še nikoli".
 *
 * "Še nikoli" je POUDAREK in ne pomanjkljivost: razvrstitev "Že dolgo ne" postavi prav te na vrh
 * (FR-053), ker je recept, ki ga človek shrani in nikoli ne skuha, natanko tisti, ki ga je vredno
 * predlagati.
 */
export function formatLastCooked(iso: string | null): string {
  if (!iso) return 'Še nikoli';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Danes';
  if (days === 1) return 'Včeraj';
  if (days < 7) return `Pred ${days} dnevi`;
  if (days < 31) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? 'Pred tednom' : `Pred ${weeks} tedni`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? 'Pred mesecem' : `Pred ${months} meseci`;
  const years = Math.floor(days / 365);
  return years === 1 ? 'Pred letom' : `Pred ${years} leti`;
}

/**
 * Kar `ngModel` na `ion-input` DEJANSKO vrne: niz (besedilo), število (`type="number"`), ali nič
 * (prazno polje `type="number"`, in stanje pred prvim vnosom).
 *
 * ZAKAJ TO OBSTAJA. Prva različica urejevalnika je predpostavljala, da so vse vrednosti iz
 * `ngModel` NIZI, in klicala `value.trim()`. Niso: `IonInput` sam prepiše `registerOnChange` in
 * pri `type="number"` sporoči `parseFloat(value)` oziroma `null` za prazno polje
 * (`@ionic/angular`, `ionic-angular-standalone.mjs`). `(45).trim()` vrže `TypeError` — sinhrono,
 * znotraj `try` bloka v `save()`.
 *
 * Posledica je bila natanko taka, kot je bila videti pri uporabi: gumb je pokazal "Recepta ni bilo
 * mogoče shraniti", zahteva na API pa ni šla nikoli ven. Padlo je vsako shranjevanje, pri katerem
 * je bil vpisan ČAS PRIPRAVE ali PORCIJE — torej pri vsakem pravem receptu.
 *
 * To se je v tem repozitoriju zgodilo že enkrat, pri krajih ploščice "Pot"
 * (`features/settings/commute-form.ts`). Tam je vzorec zapisan enako; PREPISAN je in ne uvožen,
 * ker uvoz med funkcionalnostmi pod `features/` prepoveduje člen I.
 */
export type FormFieldValue = string | number | null | undefined;

/** Vrednost polja kot obrezan niz — ne glede na to, ali je `ngModel` vrnil niz ali število. */
export function asText(value: FormFieldValue): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Polje s številom (čas priprave, porcije) kot pozitivno celo število, ali `null`.
 *
 * `null` je POMENSKA vrednost ("ni podatka") in ne "ne spreminjaj": uporabnik, ki je čas izbrisal,
 * ga je izbrisal z namenom, in strežnik prazno vrednost tako tudi razume.
 *
 * Decimalna vejica je dovoljena iz istega razloga kot pri koordinatah: slovenska tipkovnica jo
 * ponudi prva, `Number('1,5')` pa je `NaN`. Vrednost se zaokroži — pol porcije in pol minute pri
 * receptu nista podatek, ki bi ga bilo vredno hraniti.
 */
export function toOptionalCount(value: FormFieldValue): number | null {
  const parsed = typeof value === 'number' ? value : Number(asText(value).replace(',', '.'));
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : null;
}

/** Večvrstični vnos v seznam vnosov. Isto pravilo kot na strežniku (`splitLines`), tu zato, da
 * urejevalnik pokaže, kaj bo shranjeno, še preden shrani. Strežnik ga vseeno uveljavi znova —
 * odjemalčeva različica je udobje, ne varovalo. */
export function splitLines(value: FormFieldValue): string[] {
  return asText(value)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•‣·]|\d+[.)])\s+/, '').trim())
    .filter((line) => line.length > 0);
}
