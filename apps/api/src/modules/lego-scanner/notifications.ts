import { emailSubject } from '../../platform/email/mailer.service.js';
import { ScannerResultModel } from '../../platform/scanner/models/scanner-result.model.js';
import type { Money, NotifiableChangeType, NotificationHooks, NotificationItem, RenderContext, RenderedDigest } from '../../platform/scanner/types.js';
import { Types } from 'mongoose';
import type { EventReason } from './events.js';
import type { LegoCondition } from './domain/types.js';

// Kavlja tipa `lego` za outbox jedra (018, FR-021). `verify` pred pošiljanjem ZNOVA prebere rezultat
// (ni več na voljo ali izbrisan → postavka odpade; cena in dobiček se vzameta iz aktualnega zapisa,
// ne iz posnetka dogodka). `render` sestavi zbirni dopis. Izračun dobička je v dopisu označen kot
// OCENA, umik ni "prodano", zadnja ponudba na dražbi ni končna cena.

export interface LegoDigestItem {
  scannerName: string;
  resultId: string;
  title: string;
  url: string | null;
  imageUrl: string | null;
  price: Money;
  shipping: Money | null;
  marketplace: string;
  setNumber: string | null;
  setName: string | null;
  condition: LegoCondition;
  listingType: 'FIXED_PRICE' | 'AUCTION';
  endsAt: string | null;
  valuation: { average: number; salesCount: number; confidence: string } | null;
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
    lego?: { setNumber?: string; setName?: string; condition?: LegoCondition };
    listing?: { marketplace?: string; listingType?: 'FIXED_PRICE' | 'AUCTION'; endsAt?: string | null; shipping?: Money | null; images?: string[] };
    valuation?: { average: number | null; salesCount: number; confidence: string; comparable: boolean } | null;
    opportunity?: { profit: number | null; roi: number | null };
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

const CONDITION_LABELS: Record<LegoCondition, string> = {
  NEW_SEALED: 'novo, zapečateno',
  NEW_OPEN_BOX: 'novo, odprta škatla',
  USED_COMPLETE: 'rabljeno, kompletno',
  USED_INCOMPLETE: 'rabljeno, nekompletno',
  PARTS_ONLY: 'samo deli',
  UNKNOWN: 'stanje ni znano',
};

export async function verifyLegoItems(items: NotificationItem[]): Promise<LegoDigestItem[]> {
  const out: LegoDigestItem[] = [];
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
      setNumber: d.lego?.setNumber ?? null,
      setName: d.lego?.setName ?? null,
      condition: d.lego?.condition ?? 'UNKNOWN',
      listingType: d.listing?.listingType ?? 'FIXED_PRICE',
      endsAt: d.listing?.endsAt ?? null,
      valuation: v && v.comparable && v.average !== null ? { average: v.average, salesCount: v.salesCount, confidence: v.confidence } : null,
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

export function renderLegoDigest(items: LegoDigestItem[], ctx: RenderContext): RenderedDigest {
  const subject = emailSubject(ctx.appName, 'LEGO', plural(items.length));
  const rows = items.map((i) => {
    const labels = (i.reasons.length > 0 ? i.reasons : [i.changeType === 'NEW' ? 'new' : 'changed']).map((r) => REASON_LABELS[r as EventReason] ?? String(r)).join(' · ');
    const set = i.setNumber ? `${i.setNumber}${i.setName ? ` ${esc(i.setName)}` : ''}` : 'set ni prepoznan';
    const price = i.listingType === 'AUCTION' ? `trenutna ponudba ${money(i.price)} (ni končna cena)` : money(i.price);
    const value = i.valuation ? `ocenjena vrednost ${money({ amount: i.valuation.average, currency: 'EUR' })} (${i.valuation.salesCount} prodaj, zaupanje ${i.valuation.confidence})` : 'vrednost: premalo podatkov';
    const profit = i.profit !== null ? `ocenjen dobiček ${money({ amount: i.profit, currency: 'EUR' })}${i.roi !== null ? ` (ROI ${(i.roi * 100).toFixed(1)} %)` : ''} — ocena, ne dejstvo` : 'dobiček ni izračunan';
    const ends = i.listingType === 'AUCTION' && i.endsAt ? ` · izteče ${new Date(i.endsAt).toLocaleString('sl-SI', { timeZone: 'Europe/Ljubljana' })}` : '';
    const link = i.url ? `<a href="${esc(i.url)}">${esc(i.title)}</a>` : esc(i.title);
    return `<li style="margin-bottom:12px"><strong>${labels}</strong> · ${esc(i.scannerName)}<br>${link}<br>${esc(set)} · ${CONDITION_LABELS[i.condition]} · ${esc(i.marketplace)}<br>${price} + poštnina ${money(i.shipping)}${ends}<br>${value}<br>${profit}</li>`;
  });
  const html = `<p>LEGO skener je zaznal spremembe (${ctx.checkedAt.toISOString()}).</p><ul style="padding-left:18px">${rows.join('')}</ul><p style="color:#6b7280;font-size:12px">Ocene temeljijo na prodajah zadnjih šestih mesecev in nastavljenih parametrih; niso nasvet za nakup.</p><p><a href="${ctx.baseUrl}/scanners">Odpri v ${esc(ctx.appName)}</a></p>`;
  const text = items
    .map((i) => `${(i.reasons.length > 0 ? i.reasons : ['changed']).map((r) => REASON_LABELS[r as EventReason] ?? r).join(' · ')} · ${i.scannerName} · ${i.title} · ${money(i.price)}${i.profit !== null ? ` · ocenjen dobiček ${money({ amount: i.profit, currency: 'EUR' })}` : ''}${i.url ? ` · ${i.url}` : ''}`)
    .join('\n');
  return { subject, html, text };
}

export const legoNotificationHooks: NotificationHooks<LegoDigestItem> = {
  verify: verifyLegoItems,
  render: renderLegoDigest,
};
