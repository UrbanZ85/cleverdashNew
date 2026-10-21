import { Component, OnInit, effect, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { IonCheckbox, IonInput, IonItem, IonLabel, IonNote, IonSelect, IonSelectOption, IonText, IonToggle } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../../core/api/api-base.js';
import type { ScannerConfigForm } from '../../core/scanners/scanner-config-form.js';
import { HelpButtonComponent } from '../../shared/help/help-button.component.js';
import { CONDITION_LABELS, MARKETPLACE_LABELS, type LegoCondition, type LegoMarketplace, type LegoSources, type ListingType } from './lego.model.js';

// Obrazec LEGO skenerja (018, FR-023): 2. korak čarovnika. Izpolni `ScannerConfigForm`; čarovnik ga vstavi
// z `NgComponentOutlet` prek registra (scanner-ui.ts). Strežnik nastavitve preveri še enkrat po shemi
// tipa — to je prva, prijaznejša mreža. Pokaže tudi, kateri viri v namestitvi so vklopljeni (da/ne).
//
// "Upokojen" namenoma ni med filtri: noben dovoljen vir tega ne pove zanesljivo.

const CONDITIONS = Object.keys(CONDITION_LABELS) as LegoCondition[];

function toNumber(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

@Component({
  selector: 'app-lego-config',
  standalone: true,
  imports: [FormsModule, HelpButtonComponent, IonItem, IonInput, IonLabel, IonNote, IonSelect, IonSelectOption, IonToggle, IonCheckbox, IonText],
  template: `
    @if (sources(); as s) {
      <div class="sources">
        <ion-note>
          Viri v tej namestitvi:
          <strong [class.off]="!s.catalog.enabled">{{ s.catalog.label }}</strong> ·
          <strong [class.off]="!s.prices.enabled">{{ s.prices.label }}</strong> ·
          <strong [class.off]="!s.listings.enabled">{{ s.listings.label }}</strong>
          @if (s.fake) {
            · <ion-text color="warning">testni vir z izmišljenimi podatki</ion-text>
          }
        </ion-note>
        @if (!s.listings.enabled) {
          <ion-text color="warning"><p class="msg">Vir oglasov ni vklopljen ({{ s.listings.reason }}) — skener se bo shranil, a zagon ne bo našel oglasov.</p></ion-text>
        }
        @if (!s.prices.enabled && s.listings.enabled) {
          <ion-note class="msg">Brez cenika ({{ s.prices.reason }}) ni tržne vrednosti ne dobička; oglasi so še vedno prikazani.</ion-note>
        }
      </div>
    }

    <h3 class="cd-section-title">Kaj iščem <app-help topic="scanners.lego"></app-help></h3>
    <ion-item>
      <ion-input label="Številka seta" labelPlacement="stacked" [(ngModel)]="setNumber" name="setNumber" placeholder="npr. 75192" (ionInput)="sync()"></ion-input>
    </ion-item>
    <ion-item>
      <ion-input label="Ključne besede" labelPlacement="stacked" [(ngModel)]="keywords" name="keywords" maxlength="120" placeholder="npr. millennium falcon" (ionInput)="sync()"></ion-input>
    </ion-item>
    <div class="row">
      <ion-item><ion-input label="Tema" labelPlacement="stacked" [(ngModel)]="theme" name="theme" maxlength="60" placeholder="npr. Star Wars" (ionInput)="sync()"></ion-input></ion-item>
      <ion-item><ion-input label="Podtema" labelPlacement="stacked" [(ngModel)]="subtheme" name="subtheme" maxlength="60" (ionInput)="sync()"></ion-input></ion-item>
    </div>
    <div class="row">
      <ion-item><ion-input label="Letnik od" labelPlacement="stacked" type="number" inputmode="numeric" [(ngModel)]="minYear" name="minYear" (ionInput)="sync()"></ion-input></ion-item>
      <ion-item><ion-input label="Letnik do" labelPlacement="stacked" type="number" inputmode="numeric" [(ngModel)]="maxYear" name="maxYear" (ionInput)="sync()"></ion-input></ion-item>
    </div>
    <ion-note class="hint">Tema, podtema in letnik se preverjajo po katalogu: oglas, ki ga ni mogoče prepoznati, tem filtrom ne ustreza.</ion-note>

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
    <ion-note class="hint">Kompletnost rabljenega seta se ne domneva: dokler prodajalec tega izrecno ne navede, je stanje "ni znano".</ion-note>
    <ion-item lines="none"><ion-toggle [(ngModel)]="fixedPrice" name="fixedPrice" (ionChange)="sync()">Fiksna cena</ion-toggle></ion-item>
    <ion-item lines="none"><ion-toggle [(ngModel)]="auction" name="auction" (ionChange)="sync()">Dražbe</ion-toggle></ion-item>

    <h3 class="cd-section-title">Pogoji in obvestila</h3>
    <div class="row">
      <ion-item><ion-input label="Najmanjši popust (%)" labelPlacement="stacked" type="number" inputmode="decimal" [(ngModel)]="minDiscountPct" name="minDiscountPct" (ionInput)="sync()"></ion-input></ion-item>
      <ion-item><ion-input label="Najmanjši dobiček" labelPlacement="stacked" type="number" inputmode="decimal" [(ngModel)]="minProfit" name="minProfit" (ionInput)="sync()"></ion-input></ion-item>
      <ion-item><ion-input label="Največja poštnina" labelPlacement="stacked" type="number" inputmode="decimal" [(ngModel)]="maxShipping" name="maxShipping" (ionInput)="sync()"></ion-input></ion-item>
    </div>
    <ion-note class="hint">Popust in dobiček sta ocena iz prodaj zadnjih šestih mesecev; oglas z neznano vrednostjo, poštnino ali dobičkom filtru ne ustreza.</ion-note>
    <div class="row">
      <ion-item><ion-input label="Obvesti, ko je ocenjen dobiček vsaj" labelPlacement="stacked" type="number" inputmode="decimal" [(ngModel)]="notifyMinProfit" name="notifyMinProfit" (ionInput)="sync()"></ion-input></ion-item>
      <ion-item><ion-input label="Dražba se izteka (ur)" labelPlacement="stacked" type="number" inputmode="numeric" min="1" max="72" [(ngModel)]="auctionEndingHours" name="auctionEndingHours" (ionInput)="sync()"></ion-input></ion-item>
    </div>
    <ion-note class="hint">Brez praga obvestila dobiš dopis ob vsakem novem ali spremenjenem oglasu; s pragom samo ob oglasih z znanim dobičkom nad njim.</ion-note>
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
export class LegoConfigComponent implements ScannerConfigForm, OnInit {
  private readonly http = inject(HttpClient);

  readonly initial = input<Record<string, unknown> | null>(null);
  readonly config = signal<Record<string, unknown>>({ marketplaces: ['EBAY_DE'], currency: 'EUR' });
  readonly sources = signal<LegoSources | null>(null);
  readonly marketplaceOptions = signal<LegoMarketplace[]>(['EBAY_DE', 'EBAY_IT']);
  readonly marketplaces = signal<LegoMarketplace[]>(['EBAY_DE']);

  readonly conditionOptions = CONDITIONS;
  readonly conditionLabels = CONDITION_LABELS;
  readonly marketplaceLabel = (m: string) => MARKETPLACE_LABELS[m as LegoMarketplace] ?? m;

  setNumber = '';
  keywords = '';
  theme = '';
  subtheme = '';
  minYear: number | string = '';
  maxYear: number | string = '';
  minPrice: number | string = '';
  maxPrice: number | string = '';
  currency = 'EUR';
  sellerCountriesText = '';
  conditions: LegoCondition[] = [];
  fixedPrice = true;
  auction = true;
  minDiscountPct: number | string = '';
  minProfit: number | string = '';
  maxShipping: number | string = '';
  notifyMinProfit: number | string = '';
  auctionEndingHours: number | string = 6;

  constructor() {
    effect(() => {
      const c = this.initial();
      if (!c) return;
      const text = (v: unknown) => (typeof v === 'string' ? v : '');
      const num = (v: unknown) => (typeof v === 'number' ? v : '');
      this.setNumber = text(c['setNumber']);
      this.keywords = text(c['keywords']);
      this.theme = text(c['theme']);
      this.subtheme = text(c['subtheme']);
      this.minYear = num(c['minYear']);
      this.maxYear = num(c['maxYear']);
      this.minPrice = num(c['minPrice']);
      this.maxPrice = num(c['maxPrice']);
      this.currency = text(c['currency']) || 'EUR';
      this.sellerCountriesText = Array.isArray(c['sellerCountries']) ? (c['sellerCountries'] as string[]).join(', ') : '';
      this.conditions = Array.isArray(c['conditions']) ? (c['conditions'] as LegoCondition[]) : [];
      const types = Array.isArray(c['listingTypes']) ? (c['listingTypes'] as ListingType[]) : ['FIXED_PRICE', 'AUCTION'];
      this.fixedPrice = types.includes('FIXED_PRICE');
      this.auction = types.includes('AUCTION');
      this.minDiscountPct = num(c['minDiscountPct']);
      this.minProfit = num(c['minProfit']);
      this.maxShipping = num(c['maxShipping']);
      this.notifyMinProfit = num(c['notifyMinProfit']);
      this.auctionEndingHours = typeof c['auctionEndingHours'] === 'number' ? c['auctionEndingHours'] : 6;
      this.marketplaces.set(Array.isArray(c['marketplaces']) && c['marketplaces'].length > 0 ? (c['marketplaces'] as LegoMarketplace[]) : ['EBAY_DE']);
      this.sync();
    });
  }

  ngOnInit(): void {
    void firstValueFrom(this.http.get<LegoSources>(apiUrl('/lego-scanner/sources'), { withCredentials: true }))
      .then((s) => {
        this.sources.set(s);
        if (s.marketplaces.length > 0) this.marketplaceOptions.set(s.marketplaces);
      })
      .catch(() => this.sources.set(null));
    this.sync();
  }

  toggleMarketplace(m: LegoMarketplace, checked: boolean): void {
    const set = new Set(this.marketplaces());
    if (checked) set.add(m);
    else set.delete(m);
    this.marketplaces.set([...set]);
    this.sync();
  }

  /** Prebere obrazec v `config`; prazna polja so izpuščena (strežnik doda privzetke). */
  sync(): void {
    const out: Record<string, unknown> = {};
    const text = (key: string, value: string) => {
      if (value.trim().length > 0) out[key] = value.trim();
    };
    const num = (key: string, value: number | string) => {
      const n = toNumber(value);
      if (n !== undefined) out[key] = n;
    };
    text('setNumber', this.setNumber);
    text('keywords', this.keywords);
    text('theme', this.theme);
    text('subtheme', this.subtheme);
    num('minYear', this.minYear);
    num('maxYear', this.maxYear);
    num('minPrice', this.minPrice);
    num('maxPrice', this.maxPrice);
    out['currency'] = this.currency.trim().toUpperCase() || 'EUR';
    out['marketplaces'] = this.marketplaces();
    const countries = this.sellerCountriesText.split(/[,\s;]+/).map((s) => s.trim().toUpperCase()).filter((s) => s.length > 0);
    out['sellerCountries'] = countries;
    out['conditions'] = this.conditions;
    const types: ListingType[] = [];
    if (this.fixedPrice) types.push('FIXED_PRICE');
    if (this.auction) types.push('AUCTION');
    out['listingTypes'] = types;
    num('minDiscountPct', this.minDiscountPct);
    num('minProfit', this.minProfit);
    num('maxShipping', this.maxShipping);
    num('notifyMinProfit', this.notifyMinProfit);
    num('auctionEndingHours', this.auctionEndingHours);
    this.config.set(out);
  }

  validate(): string | null {
    this.sync();
    const c = this.config();
    const nan = (key: string) => typeof c[key] === 'number' && Number.isNaN(c[key]);
    if (['minYear', 'maxYear', 'minPrice', 'maxPrice', 'minDiscountPct', 'minProfit', 'maxShipping', 'notifyMinProfit', 'auctionEndingHours'].some(nan)) return 'Številčna polja morajo vsebovati veljavno število.';
    if (!c['setNumber'] && !c['keywords'] && !c['theme'] && c['maxPrice'] === undefined) {
      return 'Vpiši vsaj eno od: številka seta, ključne besede, tema ali najvišja cena — sicer bi iskanje zajelo vse oglase.';
    }
    if (this.setNumber.trim() && !/^(?:lego\s*)?\d{4,6}(?:-\d{1,2})?$/i.test(this.setNumber.trim())) return 'Številka seta mora imeti 4 do 6 števk (npr. 75192 ali 75192-1).';
    if (typeof c['minPrice'] === 'number' && typeof c['maxPrice'] === 'number' && c['maxPrice'] < c['minPrice']) return 'Najvišja cena ne sme biti pod najnižjo.';
    if (typeof c['minYear'] === 'number' && typeof c['maxYear'] === 'number' && c['maxYear'] < c['minYear']) return 'Najpoznejši letnik ne sme biti pred najzgodnejšim.';
    if (this.subtheme.trim() && !this.theme.trim()) return 'Podtema zahteva temo.';
    if (this.marketplaces().length === 0) return 'Izberi vsaj eno tržnico.';
    if (!this.fixedPrice && !this.auction) return 'Izberi fiksno ceno, dražbe ali oboje.';
    if (typeof c['auctionEndingHours'] === 'number' && (c['auctionEndingHours'] < 1 || c['auctionEndingHours'] > 72 || !Number.isInteger(c['auctionEndingHours']))) return 'Okno izteka dražbe je od 1 do 72 celih ur.';
    return null;
  }
}
