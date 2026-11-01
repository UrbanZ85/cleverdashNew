import { Component, OnInit, computed, effect, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { IonCheckbox, IonInput, IonItem, IonNote, IonSelect, IonSelectOption, IonText, IonToggle } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../../core/api/api-base.js';
import type { ScannerConfigForm } from '../../core/scanners/scanner-config-form.js';
import {
  CATEGORY_LABELS,
  CONDITION_LABELS,
  MARKETPLACE_LABELS,
  buildCategoryConfig,
  getByPath,
  hasCategoryFilters,
  type CategoryDescriptor,
  type Category,
  type CollectiblesSources,
  type Condition,
  type FieldDescriptor,
  type FieldValues,
  type ListingType,
  type Marketplace,
} from './collectibles.model.js';

// Obrazec zbirateljskega skenerja (019, FR-029): 2. korak čarovnika. Izpolni `ScannerConfigForm`. Polja
// kategorije so DINAMIČNA: opis dobi s strežnika (`GET /collectibles-scanner/categories`), zato nova
// kategorija ne zahteva spremembe odjemalca. Skupni filtri, tržnice, vrste ponudbe in pragi obvestil so
// vedno isti. Strežnik nastavitve preveri še enkrat po shemi kategorije — to je prva, prijaznejša mreža.

const CONDITIONS = Object.keys(CONDITION_LABELS) as Condition[];
const FALLBACK_CATEGORIES: Category[] = ['trading-cards', 'retro-gaming'];

function toNumber(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

@Component({
  selector: 'app-collectibles-config',
  standalone: true,
  imports: [FormsModule, IonItem, IonInput, IonNote, IonSelect, IonSelectOption, IonToggle, IonCheckbox, IonText],
  template: `
    @if (sources(); as s) {
      <div class="sources">
        <ion-note>
          Viri v tej namestitvi:
          <strong [class.off]="!s.listings.enabled">{{ s.listings.label }}</strong> ·
          <strong [class.off]="!s.catalog.enabled">{{ s.catalog.label }}</strong> ·
          <strong [class.off]="!s.prices.enabled">{{ s.prices.label }}</strong>
          @if (s.fake) {
            · <ion-text color="warning">testni vir z izmišljenimi podatki</ion-text>
          }
        </ion-note>
        @if (!s.listings.enabled) {
          <ion-text color="warning"><p class="msg">Vir oglasov ni vklopljen ({{ s.listings.reason }}) — skener se bo shranil, a zagon ne bo našel oglasov.</p></ion-text>
        }
        @if (category() === 'retro-gaming' && !s.prices.enabled && s.listings.enabled) {
          <ion-note class="msg">Brez cenika ({{ s.prices.reason }}) retro predmeti nimajo vrednosti; oglasi so še vedno prikazani.</ion-note>
        }
      </div>
    }

    <h3 class="cd-section-title">Kaj iščem</h3>
    <ion-item>
      <ion-select label="Kategorija" labelPlacement="stacked" interface="popover" [value]="category()" (ionChange)="setCategory($any($event).detail.value)">
        @for (c of categoryOptions(); track c.category) {
          <ion-select-option [value]="c.category">{{ c.label }}</ion-select-option>
        }
      </ion-select>
    </ion-item>
    <ion-item>
      <ion-input label="Ključne besede" labelPlacement="stacked" [(ngModel)]="keywords" name="keywords" maxlength="120" placeholder="npr. Charizard" (ionInput)="sync()"></ion-input>
    </ion-item>
    <ion-item>
      <ion-input label="Izključene besede (ločene z vejico)" labelPlacement="stacked" [(ngModel)]="excludedText" name="excluded" placeholder="npr. proxy, custom" (ionInput)="sync()"></ion-input>
    </ion-item>

    @if (fields().length > 0) {
      <h3 class="cd-section-title">{{ categoryName() }}</h3>
      @for (f of fields(); track f.key) {
        @switch (f.kind) {
          @case ('select') {
            <ion-item>
              <ion-select [label]="f.label" labelPlacement="stacked" interface="popover" [value]="values()[f.key] ?? defaultOf(f)" (ionChange)="setValue(f.key, $any($event).detail.value)">
                @for (o of f.options ?? []; track o.value) {
                  <ion-select-option [value]="o.value">{{ o.label }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
          }
          @case ('boolean') {
            <ion-item lines="none"><ion-toggle [checked]="values()[f.key] === true" (ionChange)="setValue(f.key, $any($event).detail.checked)">{{ f.label }}</ion-toggle></ion-item>
          }
          @case ('number') {
            <ion-item><ion-input [label]="f.label" labelPlacement="stacked" type="number" inputmode="decimal" [value]="values()[f.key]" (ionInput)="setValue(f.key, $any($event).detail.value)"></ion-input></ion-item>
          }
          @default {
            <ion-item><ion-input [label]="f.label" labelPlacement="stacked" [value]="values()[f.key]" (ionInput)="setValue(f.key, $any($event).detail.value)"></ion-input></ion-item>
          }
        }
        @if (f.help) {
          <ion-note class="hint">{{ f.help }}</ion-note>
        }
      }
      <ion-note class="hint">Kar oglas ne pove (jezik, izdaja, regija, ocena …), ostane neznano: oglas, ki ga ni mogoče preveriti, filtru ne ustreza.</ion-note>
    }

    <h3 class="cd-section-title">Cena in tržnica</h3>
    <div class="row">
      <ion-item><ion-input label="Najnižja cena" labelPlacement="stacked" type="number" inputmode="decimal" [(ngModel)]="minPrice" name="minPrice" (ionInput)="sync()"></ion-input></ion-item>
      <ion-item><ion-input label="Najvišja cena" labelPlacement="stacked" type="number" inputmode="decimal" [(ngModel)]="maxPrice" name="maxPrice" (ionInput)="sync()"></ion-input></ion-item>
      <ion-item><ion-input label="Valuta" labelPlacement="stacked" [(ngModel)]="currency" name="currency" maxlength="3" (ionInput)="sync()"></ion-input></ion-item>
    </div>
    <div class="checks">
      @for (m of marketplaceOptions(); track m) {
        <ion-checkbox labelPlacement="end" [checked]="marketplaces().includes(m)" (ionChange)="toggleMarketplace(m, $any($event).detail.checked)">{{ marketplaceLabel(m) }}</ion-checkbox>
      }
    </div>
    <ion-item>
      <ion-input label="Država prodajalca (npr. DE, IT; prazno = vse)" labelPlacement="stacked" [(ngModel)]="sellerCountriesText" name="sellerCountries" (ionInput)="sync()"></ion-input>
    </ion-item>
    <ion-note class="hint">Iščejo se samo oglasi z dostavo v Slovenijo.</ion-note>

    <h3 class="cd-section-title">Stanje in vrsta ponudbe</h3>
    <ion-item>
      <ion-select label="Stanje (prazno = vsa)" labelPlacement="stacked" [multiple]="true" [(ngModel)]="conditions" name="conditions" okText="V redu" cancelText="Prekliči" (ionChange)="sync()">
        @for (c of conditionOptions; track c) {
          <ion-select-option [value]="c">{{ conditionLabels[c] }}</ion-select-option>
        }
      </ion-select>
    </ion-item>
    <ion-item lines="none"><ion-toggle [(ngModel)]="fixedPrice" name="fixedPrice" (ionChange)="sync()">Fiksna cena</ion-toggle></ion-item>
    <ion-item lines="none"><ion-toggle [(ngModel)]="auction" name="auction" (ionChange)="sync()">Dražbe</ion-toggle></ion-item>

    <h3 class="cd-section-title">Pogoji in obvestila</h3>
    <div class="row">
      <ion-item><ion-input label="Najmanjši popust do vrednosti (%)" labelPlacement="stacked" type="number" inputmode="decimal" [(ngModel)]="minDiscountPct" name="minDiscountPct" (ionInput)="sync()"></ion-input></ion-item>
      <ion-item><ion-input label="Najmanjši dobiček" labelPlacement="stacked" type="number" inputmode="decimal" [(ngModel)]="minProfit" name="minProfit" (ionInput)="sync()"></ion-input></ion-item>
      <ion-item><ion-input label="Največja poštnina" labelPlacement="stacked" type="number" inputmode="decimal" [(ngModel)]="maxShipping" name="maxShipping" (ionInput)="sync()"></ion-input></ion-item>
    </div>
    <ion-note class="hint">
      Popust je lahko izračunan iz kataloške ocene ali cenika (označeno ob rezultatu); dobiček samo iz preverjenih prodaj. Oglas z neznano vrednostjo, poštnino ali dobičkom filtru ne ustreza.
    </ion-note>
    <div class="row">
      <ion-item><ion-input label="Obvesti, ko je ocenjen dobiček vsaj" labelPlacement="stacked" type="number" inputmode="decimal" [(ngModel)]="notifyMinProfit" name="notifyMinProfit" (ionInput)="sync()"></ion-input></ion-item>
      <ion-item><ion-input label="ALI: obvesti, ko je popust do vrednosti vsaj (%)" labelPlacement="stacked" type="number" inputmode="decimal" [(ngModel)]="notifyMinDiscountPct" name="notifyMinDiscountPct" (ionInput)="sync()"></ion-input></ion-item>
      <ion-item><ion-input label="Dražba se izteka (ur)" labelPlacement="stacked" type="number" inputmode="numeric" min="1" max="72" [(ngModel)]="auctionEndingHours" name="auctionEndingHours" (ionInput)="sync()"></ion-input></ion-item>
    </div>
    <ion-note class="hint">Nastavi prag dobička ali prag popusta, ne obeh. Brez praga dobiš dopis ob vsakem novem ali spremenjenem oglasu.</ion-note>
  `,
  styles: [
    `
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cd-space-2);
      }
      .row ion-item {
        flex: 1 1 160px;
      }
      .checks {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cd-space-3);
        padding: var(--cd-space-2) var(--cd-space-3);
      }
      .hint,
      .msg {
        display: block;
        font-size: var(--cd-font-size-sm);
        margin: var(--cd-space-1) var(--cd-space-3);
      }
      .sources {
        margin-bottom: var(--cd-space-2);
      }
      .off {
        text-decoration: line-through;
        opacity: 0.6;
      }
      .cd-section-title {
        display: flex;
        align-items: center;
        gap: var(--cd-space-2);
        margin-top: var(--cd-space-4);
      }
    `,
  ],
})
export class CollectiblesConfigComponent implements ScannerConfigForm, OnInit {
  private readonly http = inject(HttpClient);

  readonly initial = input<Record<string, unknown> | null>(null);
  readonly config = signal<Record<string, unknown>>({ category: 'trading-cards', marketplaces: ['EBAY_DE'], currency: 'EUR' });
  readonly sources = signal<CollectiblesSources | null>(null);
  readonly categories = signal<CategoryDescriptor[]>([]);
  readonly category = signal<Category>('trading-cards');
  readonly values = signal<FieldValues>({});
  readonly marketplaceOptions = signal<Marketplace[]>(['EBAY_DE', 'EBAY_IT']);
  readonly marketplaces = signal<Marketplace[]>(['EBAY_DE']);

  readonly categoryOptions = computed<Array<{ category: Category; label: string }>>(() => {
    const loaded = this.categories();
    return loaded.length > 0 ? loaded.map((c) => ({ category: c.category, label: c.label })) : FALLBACK_CATEGORIES.map((c) => ({ category: c, label: CATEGORY_LABELS[c] }));
  });
  readonly fields = computed<FieldDescriptor[]>(() => this.categories().find((c) => c.category === this.category())?.fields ?? []);
  readonly categoryName = computed(() => this.categoryOptions().find((c) => c.category === this.category())?.label ?? '');

  readonly conditionOptions = CONDITIONS;
  readonly conditionLabels = CONDITION_LABELS;
  readonly marketplaceLabel = (m: string) => MARKETPLACE_LABELS[m as Marketplace] ?? m;

  keywords = '';
  excludedText = '';
  minPrice: number | string = '';
  maxPrice: number | string = '';
  currency = 'EUR';
  sellerCountriesText = '';
  conditions: Condition[] = [];
  fixedPrice = true;
  auction = true;
  minDiscountPct: number | string = '';
  minProfit: number | string = '';
  maxShipping: number | string = '';
  notifyMinProfit: number | string = '';
  notifyMinDiscountPct: number | string = '';
  auctionEndingHours: number | string = 6;

  constructor() {
    effect(() => {
      const c = this.initial();
      if (!c) return;
      const text = (v: unknown) => (typeof v === 'string' ? v : '');
      const num = (v: unknown) => (typeof v === 'number' ? v : '');
      this.category.set(c['category'] === 'retro-gaming' ? 'retro-gaming' : 'trading-cards');
      this.keywords = text(c['keywords']);
      this.excludedText = Array.isArray(c['excludedKeywords']) ? (c['excludedKeywords'] as string[]).join(', ') : '';
      this.minPrice = num(c['minPrice']);
      this.maxPrice = num(c['maxPrice']);
      this.currency = text(c['currency']) || 'EUR';
      this.sellerCountriesText = Array.isArray(c['sellerCountries']) ? (c['sellerCountries'] as string[]).join(', ') : '';
      this.conditions = Array.isArray(c['conditions']) ? (c['conditions'] as Condition[]) : [];
      const types = Array.isArray(c['listingTypes']) ? (c['listingTypes'] as ListingType[]) : ['FIXED_PRICE', 'AUCTION'];
      this.fixedPrice = types.includes('FIXED_PRICE');
      this.auction = types.includes('AUCTION');
      this.minDiscountPct = num(c['minDiscountPct']);
      this.minProfit = num(c['minProfit']);
      this.maxShipping = num(c['maxShipping']);
      this.notifyMinProfit = num(c['notifyMinProfit']);
      this.notifyMinDiscountPct = num(c['notifyMinDiscountPct']);
      this.auctionEndingHours = typeof c['auctionEndingHours'] === 'number' ? c['auctionEndingHours'] : 6;
      this.marketplaces.set(Array.isArray(c['marketplaces']) && c['marketplaces'].length > 0 ? (c['marketplaces'] as Marketplace[]) : ['EBAY_DE']);
      this.loadValues(c);
      this.sync();
    });
  }

  ngOnInit(): void {
    void firstValueFrom(this.http.get<CollectiblesSources>(apiUrl('/collectibles-scanner/sources'), { withCredentials: true }))
      .then((s) => {
        this.sources.set(s);
        if (s.marketplaces.length > 0) this.marketplaceOptions.set(s.marketplaces);
      })
      .catch(() => this.sources.set(null));
    void firstValueFrom(this.http.get<{ categories: CategoryDescriptor[] }>(apiUrl('/collectibles-scanner/categories'), { withCredentials: true }))
      .then((r) => {
        this.categories.set(r.categories);
        const initial = this.initial();
        if (initial) this.loadValues(initial);
        this.sync();
      })
      .catch(() => this.categories.set([]));
    this.sync();
  }

  /** Privzeta vrednost izbirnega polja v obrazcu (`any`, kadar jo kategorija pozna). */
  defaultOf(f: FieldDescriptor): string {
    return f.options?.some((o) => o.value === 'any') ? 'any' : '';
  }

  /** Napolni vrednosti polj iz shranjene nastavitve (po poti `cards.grade` ipd.). */
  private loadValues(c: Record<string, unknown>): void {
    const next: FieldValues = {};
    for (const f of this.fields()) {
      const v = getByPath(c, f.key);
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') next[f.key] = v;
    }
    this.values.set(next);
  }

  setCategory(category: Category): void {
    this.category.set(category);
    this.values.set({}); // filtri druge kategorije ne veljajo
    this.sync();
  }

  setValue(key: string, value: string | number | boolean | null | undefined): void {
    this.values.update((v) => ({ ...v, [key]: value === null ? undefined : value }));
    this.sync();
  }

  toggleMarketplace(m: Marketplace, checked: boolean): void {
    const set = new Set(this.marketplaces());
    if (checked) set.add(m);
    else set.delete(m);
    this.marketplaces.set([...set]);
    this.sync();
  }

  /** Prebere obrazec v `config`; prazna polja so izpuščena (strežnik doda privzetke). */
  sync(): void {
    const out: Record<string, unknown> = { category: this.category() };
    const text = (key: string, value: string) => {
      if (value.trim().length > 0) out[key] = value.trim();
    };
    const num = (key: string, value: number | string) => {
      const n = toNumber(value);
      if (n !== undefined) out[key] = n;
    };
    text('keywords', this.keywords);
    out['excludedKeywords'] = this.excludedText.split(/[,;]+/).map((s) => s.trim()).filter((s) => s.length > 0);
    num('minPrice', this.minPrice);
    num('maxPrice', this.maxPrice);
    out['currency'] = this.currency.trim().toUpperCase() || 'EUR';
    out['marketplaces'] = this.marketplaces();
    out['sellerCountries'] = this.sellerCountriesText.split(/[,\s;]+/).map((s) => s.trim().toUpperCase()).filter((s) => s.length > 0);
    out['conditions'] = this.conditions;
    const types: ListingType[] = [];
    if (this.fixedPrice) types.push('FIXED_PRICE');
    if (this.auction) types.push('AUCTION');
    out['listingTypes'] = types;
    num('minDiscountPct', this.minDiscountPct);
    num('minProfit', this.minProfit);
    num('maxShipping', this.maxShipping);
    num('notifyMinProfit', this.notifyMinProfit);
    num('notifyMinDiscountPct', this.notifyMinDiscountPct);
    num('auctionEndingHours', this.auctionEndingHours);
    Object.assign(out, buildCategoryConfig(this.fields(), this.values()));
    this.config.set(out);
  }

  validate(): string | null {
    this.sync();
    const c = this.config();
    const nan = (key: string) => typeof c[key] === 'number' && Number.isNaN(c[key]);
    if (['minPrice', 'maxPrice', 'minDiscountPct', 'minProfit', 'maxShipping', 'notifyMinProfit', 'notifyMinDiscountPct', 'auctionEndingHours'].some(nan)) return 'Številčna polja morajo vsebovati veljavno število.';
    if (!c['keywords'] && !hasCategoryFilters(this.fields(), this.values()) && c['maxPrice'] === undefined) {
      return 'Vpiši vsaj eno od: ključne besede, filter kategorije ali najvišja cena — sicer bi iskanje zajelo vse oglase.';
    }
    if (typeof c['minPrice'] === 'number' && typeof c['maxPrice'] === 'number' && c['maxPrice'] < c['minPrice']) return 'Najvišja cena ne sme biti pod najnižjo.';
    if (this.marketplaces().length === 0) return 'Izberi vsaj eno tržnico.';
    if (!this.fixedPrice && !this.auction) return 'Izberi fiksno ceno, dražbe ali oboje.';
    if (c['notifyMinProfit'] !== undefined && c['notifyMinDiscountPct'] !== undefined) return 'Nastavi prag obvestila po dobičku ali po popustu, ne obeh.';
    if (typeof c['auctionEndingHours'] === 'number' && (c['auctionEndingHours'] < 1 || c['auctionEndingHours'] > 72 || !Number.isInteger(c['auctionEndingHours']))) return 'Okno izteka dražbe je od 1 do 72 celih ur.';
    return null;
  }
}
