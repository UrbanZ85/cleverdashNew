import { Types } from 'mongoose';
import { emailSubject } from '../../platform/email/mailer.service.js';
import { ScannerResultModel } from '../../platform/scanner/models/scanner-result.model.js';
import type { Money, NotifiableChangeType, NotificationHooks, NotificationItem, RenderContext, RenderedDigest } from '../../platform/scanner/types.js';
import type { CollectibleCategoryId, CollectibleCondition } from './domain/types.js';
import type { EventReason } from './events.js';

// Kavlja tipa `collectibles` za outbox jedra (019, FR-024). `verify` pred pošiljanjem ZNOVA prebere rezultat
// (ni več na voljo ali izbrisan → postavka odpade; cena, popust in dobiček se vzamejo iz aktualnega zapisa,
// ne iz posnetka dogodka). `render` sestavi zbirni dopis. Vsaka vrednost nosi OZNAKO vrste (ocena, cenik,
// preverjena prodaja), dobiček je OCENA, umik ni "prodano", zadnja ponudba na dražbi ni končna cena.

export interface CollectiblesDigestItem {
  scannerName: string;
  resultId: string;
  title: string;
  url: string | null;
  imageUrl: string | null;
  price: Money;
  shipping: Money | null;
  marketplace: string;
  category: CollectibleCategoryId | null;
  name: string | null;
  condition: CollectibleCondition;
  listingType: 'FIXED_PRICE' | 'AUCTION';
  endsAt: string | null;
  valuation: { primary: 'sold' | 'guide' | 'estimate'; confidence: string } | null;
  discountPct: number | null;
  discountBasis: 'sold' | 'guide' | 'estimate' | null;
  profit: number | null;
  roi: number | null;
  reasons: EventReason[];
  changeType: NotifiableChangeType;
}

interface Payload {
  resultId?: string;
  reasons?: EventReason[];
}

interface ResultRow {
  title: string;
  url: string | null;
  price: Money | null;
  availability: 'available' | 'unavailable';
  data: {
    collectible?: { category?: CollectibleCategoryId; name?: string; condition?: CollectibleCondition };
    listing?: { marketplace?: string; listingType?: 'FIXED_PRICE' | 'AUCTION'; endsAt?: string | null; shipping?: Money | null; images?: string[] };
    valuation?: { primary: 'sold' | 'guide' | 'estimate' | null; confidence: string; comparable: boolean } | null;
    opportunity?: { profit: number | null; roi: number | null; discountPct: number | null; discountBasis: 'sold' | 'guide' | 'estimate' | null };
  } | null;
}

const REASON_LABELS: Record<EventReason, string> = {
  new: 'NOVO',
  'price-down': 'POCENITEV',
  'price-up': 'PODRAŽITEV',
  undervalued: 'PODCENJENO',
  'auction-ending': 'DRAŽBA SE IZTEKA',
  changed: 'SPREMENJENO',
};

const CONDITION_LABELS: Record<CollectibleCondition, string> = {
  NEW: 'novo',
  LIKE_NEW: 'kot novo',
  USED: 'rabljeno',
  FOR_PARTS: 'za dele / okvarjeno',
  UNKNOWN: 'stanje ni znano',
};

const BASIS_LABELS: Record<'sold' | 'guide' | 'estimate', string> = {
  sold: 'preverjene prodaje',
  guide: 'ocena iz cenika',
  estimate: 'katalogna ocena',
};

export async function verifyCollectiblesItems(items: NotificationItem[]): Promise<CollectiblesDigestItem[]> {
  const out: CollectiblesDigestItem[] = [];
  for (const item of items) {
    const payload = (item.payload ?? {}) as Payload;
    const id = payload.resultId ?? item.resultRef;
    if (!Types.ObjectId.isValid(id)) continue;
    const row = await ScannerResultModel.findById(id).lean<ResultRow | null>();
    if (!row || row.availability !== 'available' || !row.price) continue;
    const d = row.data ?? {};
    const v = d.valuation;
    out.push({
      scannerName: item.definitionName,
      resultId: id,
      title: row.title,
      url: row.url,
      imageUrl: d.listing?.images?.[0] ?? null,
      price: row.price,
      shipping: d.listing?.shipping ?? null,
      marketplace: d.listing?.marketplace ?? '',
      category: d.collectible?.category ?? null,
      name: d.collectible?.name ?? null,
      condition: d.collectible?.condition ?? 'UNKNOWN',
      listingType: d.listing?.listingType ?? 'FIXED_PRICE',
      endsAt: d.listing?.endsAt ?? null,
      valuation: v && v.comparable && v.primary ? { primary: v.primary, confidence: v.confidence } : null,
      discountPct: d.opportunity?.discountPct ?? null,
      discountBasis: d.opportunity?.discountBasis ?? null,
      profit: d.opportunity?.profit ?? null,
      roi: d.opportunity?.roi ?? null,
      reasons: payload.reasons ?? [],
      changeType: item.changeType,
    });
  }
  return out;
}

function money(m: Money | null): string {
  return m ? `${Number.isInteger(m.amount) ? m.amount : m.amount.toFixed(2)} ${m.currency === 'EUR' ? '€' : m.currency}` : 'neznano';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function plural(n: number): string {
  return `${n} ${n === 1 ? 'sprememba' : n === 2 ? 'spremembi' : n === 3 || n === 4 ? 'spremembe' : 'sprememb'}`;
}

function labelsOf(i: CollectiblesDigestItem): string {
  return (i.reasons.length > 0 ? i.reasons : [i.changeType === 'NEW' ? 'new' : 'changed']).map((r) => REASON_LABELS[r as EventReason] ?? String(r)).join(' · ');
}

function valueLine(i: CollectiblesDigestItem): string {
  if (!i.valuation) return 'vrednost: premalo podatkov';
  const discount = i.discountPct !== null && i.discountBasis ? `${i.discountPct.toFixed(1)} % ${i.discountPct >= 0 ? 'pod' : 'nad'} vrednostjo (${BASIS_LABELS[i.discountBasis]}, zaupanje ${i.valuation.confidence})` : `vrednost: ${BASIS_LABELS[i.valuation.primary]}`;
  return discount;
}

function profitLine(i: CollectiblesDigestItem): string {
  return i.profit !== null ? `ocenjen dobiček ${money({ amount: i.profit, currency: i.price.currency })}${i.roi !== null ? ` (ROI ${(i.roi * 100).toFixed(1)} %)` : ''} — ocena iz preverjenih prodaj, ne dejstvo` : 'dobiček ni izračunan (ni preverjenih prodaj ali manjkajo podatki)';
}

export function renderCollectiblesDigest(items: CollectiblesDigestItem[], ctx: RenderContext): RenderedDigest {
  const subject = emailSubject(ctx.appName, 'Zbirateljski predmeti', plural(items.length));
  const rows = items.map((i) => {
    const price = i.listingType === 'AUCTION' ? `trenutna ponudba ${money(i.price)} (ni končna cena)` : money(i.price);
    const ends = i.listingType === 'AUCTION' && i.endsAt ? ` · izteče ${new Date(i.endsAt).toLocaleString('sl-SI', { timeZone: 'Europe/Ljubljana' })}` : '';
    const link = i.url ? `<a href="${esc(i.url)}">${esc(i.title)}</a>` : esc(i.title);
    const name = i.name ? `${esc(i.name)} · ` : '';
    return `<li style="margin-bottom:12px"><strong>${labelsOf(i)}</strong> · ${esc(i.scannerName)}<br>${link}<br>${name}${CONDITION_LABELS[i.condition]} · ${esc(i.marketplace)}<br>${price} + poštnina ${money(i.shipping)}${ends}<br>${valueLine(i)}<br>${profitLine(i)}</li>`;
  });
  const html = `<p>Zbirateljski skener je zaznal spremembe (${ctx.checkedAt.toISOString()}).</p><ul style="padding-left:18px">${rows.join('')}</ul><p style="color:#6b7280;font-size:12px">Vrednosti so ocene iz kataloga ali cenika, razen kjer je navedeno "preverjene prodaje"; niso nasvet za nakup. Pristnosti predmeta iz oglasa ni mogoče potrditi.</p><p><a href="${ctx.baseUrl}/scanners">Odpri v ${esc(ctx.appName)}</a></p>`;
  const text = items
    .map((i) => `${labelsOf(i)} · ${i.scannerName} · ${i.title} · ${money(i.price)}${i.discountPct !== null && i.discountBasis ? ` · ${i.discountPct.toFixed(1)} % do vrednosti (${BASIS_LABELS[i.discountBasis]})` : ''}${i.profit !== null ? ` · ocenjen dobiček ${money({ amount: i.profit, currency: i.price.currency })}` : ''}${i.url ? ` · ${i.url}` : ''}`)
    .join('\n');
  return { subject, html, text };
}

export const collectiblesNotificationHooks: NotificationHooks<CollectiblesDigestItem> = {
  verify: verifyCollectiblesItems,
  render: renderCollectiblesDigest,
};
