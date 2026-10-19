import { DateTime } from 'luxon';
import { emailSubject } from '../../../platform/email/mailer.service.js';
import type { Airport, ChangeType, Money } from './types.js';

// Zbirni dopis (FR-035). Čista funkcija: iz postavk sestavi zadevo, HTML in golo besedilo.
//
// Slogi so INLINE, ker poštni odjemalci `<style>` pogosto odrežejo; barvi sta ISTA heksa kot
// `--ion-color-success` in `--ion-color-danger` v apps/web/src/theme/variables.scss (svetla tema),
// ker CSS spremenljivke v e-pošti ne delujejo (research.md §9). Stara cena je `<s>` in ne samo
// barva — barva na nekaterih zaslonih ni vidna, prečrtanje je (FR-030).
//
// V telesu NI e-naslova prejemnika in ničesar o drugih prejemnikih (FR-044).

export const EMAIL_GREEN = '#1a7f4b';
export const EMAIL_RED = '#c02626';
export const EMAIL_MUTED = '#6b7280';

export interface DigestSegment {
  departureAt: Date;
  departureTz: string;
  arrivalAt: Date | null;
  arrivalTz: string;
  flightNumbers: string[];
  stops: number;
}

export interface DigestItem {
  ruleName: string;
  /** Samo pri deljenem iskanju. */
  ruleOwnerName: string | null;
  offerId: string;
  origin: Airport;
  destination: Airport;
  airline: string;
  airlineName: string | null;
  outbound: DigestSegment;
  inbound: DigestSegment | null;
  nights: number | null;
  passengers: { adults: number; children: number };
  price: Money;
  previousPrice: Money | null;
  priceIncludes: string | null;
  changeType: ChangeType;
  bookingUrl: string | null;
  providerLabel: string;
  providerOfficial: boolean;
  dataAt: Date;
}

export interface DigestContext {
  /** PUBLIC_BASE_URL brez končne poševnice. */
  baseUrl: string;
  checkedAt: Date;
  appName: string;
}

export interface RenderedDigest {
  subject: string;
  html: string;
  text: string;
}

export function formatMoneySl(money: Money): string {
  const amount = Number.isInteger(money.amount)
    ? String(money.amount)
    : money.amount.toFixed(2).replace('.', ',');
  const symbol = money.currency === 'EUR' ? '€' : money.currency;
  return `${amount} ${symbol}`;
}

export function formatLocalDateTime(instant: Date, tz: string): string {
  return DateTime.fromJSDate(instant, { zone: 'utc' }).setZone(tz).setLocale('sl').toFormat("ccc, d. L. yyyy 'ob' HH:mm");
}

export function formatLocalDate(instant: Date, tz: string): string {
  return DateTime.fromJSDate(instant, { zone: 'utc' }).setZone(tz).setLocale('sl').toFormat('d. L. yyyy');
}

export function changeLabel(type: ChangeType): string {
  switch (type) {
    case 'NEW':
      return 'NOVO';
    case 'PRICE_DOWN':
      return 'POCENITEV';
    case 'PRICE_UP':
      return 'PODRAŽITEV';
    case 'UNCHANGED':
      return 'NESPREMENJENO';
    case 'UNAVAILABLE':
      return 'NI VEČ NA VOLJO';
  }
}

export function changeColor(type: ChangeType): string | null {
  if (type === 'PRICE_DOWN') return EMAIL_GREEN;
  if (type === 'PRICE_UP') return EMAIL_RED;
  return null;
}

function pluralize(n: number, one: string, two: string, few: string, many: string): string {
  const mod100 = n % 100;
  if (mod100 === 1) return `${n} ${one}`;
  if (mod100 === 2) return `${n} ${two}`;
  if (mod100 === 3 || mod100 === 4) return `${n} ${few}`;
  return `${n} ${many}`;
}

/** "2 novi ponudbi, 1 pocenitev" — besedilo brez predpone aplikacije. */
export function digestSummary(items: readonly DigestItem[]): string {
  const news = items.filter((i) => i.changeType === 'NEW').length;
  const downs = items.filter((i) => i.changeType === 'PRICE_DOWN').length;
  const ups = items.filter((i) => i.changeType === 'PRICE_UP').length;
  const parts: string[] = [];
  if (news > 0) parts.push(pluralize(news, 'nova ponudba', 'novi ponudbi', 'nove ponudbe', 'novih ponudb'));
  if (downs > 0) parts.push(pluralize(downs, 'pocenitev', 'pocenitvi', 'pocenitve', 'pocenitev'));
  if (ups > 0) parts.push(pluralize(ups, 'podražitev', 'podražitvi', 'podražitve', 'podražitev'));
  return parts.join(', ') || 'spremembe ponudb';
}

/** `CleverDash - [Leti] 2 novi ponudbi, 1 pocenitev` (skupna oblika zadeve, platform/email). */
export function digestSubject(items: readonly DigestItem[], appName: string): string {
  return emailSubject(appName, 'Leti', digestSummary(items));
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function priceDeltaText(item: DigestItem): string | null {
  if (!item.previousPrice || item.previousPrice.currency !== item.price.currency) return null;
  const diff = Math.round((item.price.amount - item.previousPrice.amount) * 100) / 100;
  if (diff === 0) return null;
  const pct = Math.round((diff / item.previousPrice.amount) * 1000) / 10;
  const sign = diff < 0 ? '−' : '+';
  const abs = Math.abs(diff);
  const absText = Number.isInteger(abs) ? String(abs) : abs.toFixed(2).replace('.', ',');
  const pctText = String(Math.abs(pct)).replace('.', ',');
  return `${sign}${absText} ${item.price.currency === 'EUR' ? '€' : item.price.currency} (${sign}${pctText} %)`;
}

function segmentLine(label: string, seg: DigestSegment): string {
  const flights = seg.flightNumbers.length > 0 ? ` · ${seg.flightNumbers.join(', ')}` : '';
  const stops = seg.stops === 0 ? 'direktno' : seg.stops === 1 ? '1 prestop' : `${seg.stops} prestopi`;
  return `${label}: ${formatLocalDateTime(seg.departureAt, seg.departureTz)} (${seg.departureTz})${flights} · ${stops}`;
}

function passengersText(p: { adults: number; children: number }): string {
  const adults = pluralize(p.adults, 'odrasel', 'odrasla', 'odrasli', 'odraslih');
  if (p.children === 0) return adults;
  return `${adults}, ${pluralize(p.children, 'otrok', 'otroka', 'otroci', 'otrok')}`;
}

function renderItemHtml(item: DigestItem, ctx: DigestContext): string {
  const color = changeColor(item.changeType);
  const label = changeLabel(item.changeType);
  const badgeColor = color ?? '#1f6feb';
  const priceHtml = color
    ? `<span style="color:${color};font-weight:700;font-size:20px">${esc(formatMoneySl(item.price))}</span>`
    : `<span style="font-weight:700;font-size:20px">${esc(formatMoneySl(item.price))}</span>`;
  const previousHtml =
    item.previousPrice && item.changeType !== 'NEW'
      ? `<s style="color:${EMAIL_MUTED}">${esc(formatMoneySl(item.previousPrice))}</s> `
      : '';
  const delta = priceDeltaText(item);
  const deltaHtml = delta && color ? `<div style="color:${color};font-size:14px">${esc(delta)}</div>` : '';
  const owner = item.ruleOwnerName ? ` <span style="color:${EMAIL_MUTED}">(deli ${esc(item.ruleOwnerName)})</span>` : '';
  const nights = item.nights !== null ? ` · ${pluralize(item.nights, 'nočitev', 'nočitvi', 'nočitve', 'nočitev')}` : '';
  const airline = item.airlineName ? `${esc(item.airlineName)} (${esc(item.airline)})` : esc(item.airline);
  const booking = item.bookingUrl
    ? `<a href="${esc(item.bookingUrl)}" style="color:#1f6feb">Rezervacija pri viru</a> · `
    : '';
  const appLink = `${ctx.baseUrl}/flight-deals/offers/${esc(item.offerId)}`;
  const unofficial = item.providerOfficial ? '' : ` <span style="color:${EMAIL_RED}">(neuradni vir)</span>`;
  const includes = item.priceIncludes ? `<div style="color:${EMAIL_MUTED};font-size:12px">${esc(item.priceIncludes)}</div>` : '';

  return `
<tr><td style="padding:14px 0;border-bottom:1px solid #e5e7eb">
  <div style="font-size:12px;color:${EMAIL_MUTED}">${esc(item.ruleName)}${owner}</div>
  <div style="margin:4px 0 6px 0">
    <span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${badgeColor};color:#fff;font-size:12px;font-weight:700">${label}</span>
    <strong style="font-size:16px;margin-left:6px">${esc(item.origin.city)} (${esc(item.origin.iata)}) → ${esc(item.destination.city)} (${esc(item.destination.iata)})</strong>
  </div>
  <div style="font-size:14px">${airline}${nights} · ${esc(passengersText(item.passengers))}</div>
  <div style="font-size:14px;color:#374151">${esc(segmentLine('Odhod', item.outbound))}</div>
  ${item.inbound ? `<div style="font-size:14px;color:#374151">${esc(segmentLine('Povratek', item.inbound))}</div>` : ''}
  <div style="margin-top:6px">${previousHtml}${priceHtml}</div>
  ${deltaHtml}
  ${includes}
  <div style="font-size:12px;color:${EMAIL_MUTED};margin-top:6px">${booking}<a href="${appLink}" style="color:#1f6feb">Odpri v ${esc(ctx.appName)}</a> · vir: ${esc(item.providerLabel)}${unofficial} · podatek z dne ${esc(formatLocalDateTime(item.dataAt, 'Europe/Ljubljana'))}</div>
</td></tr>`;
}

function renderItemText(item: DigestItem, ctx: DigestContext): string {
  const lines = [
    `[${changeLabel(item.changeType)}] ${item.ruleName}${item.ruleOwnerName ? ` (deli ${item.ruleOwnerName})` : ''}`,
    `${item.origin.city} (${item.origin.iata}) → ${item.destination.city} (${item.destination.iata}) · ${item.airlineName ?? item.airline}`,
    segmentLine('Odhod', item.outbound),
  ];
  if (item.inbound) lines.push(segmentLine('Povratek', item.inbound));
  if (item.nights !== null) lines.push(pluralize(item.nights, 'nočitev', 'nočitvi', 'nočitve', 'nočitev'));
  lines.push(passengersText(item.passengers));
  const delta = priceDeltaText(item);
  lines.push(
    item.previousPrice && item.changeType !== 'NEW'
      ? `Cena: ${formatMoneySl(item.price)} (prej ${formatMoneySl(item.previousPrice)}${delta ? `, ${delta}` : ''})`
      : `Cena: ${formatMoneySl(item.price)}`,
  );
  if (item.priceIncludes) lines.push(item.priceIncludes);
  if (item.bookingUrl) lines.push(`Rezervacija: ${item.bookingUrl}`);
  lines.push(`V aplikaciji: ${ctx.baseUrl}/flight-deals/offers/${item.offerId}`);
  lines.push(`Vir: ${item.providerLabel}${item.providerOfficial ? '' : ' (neuradni vir)'} · podatek z dne ${formatLocalDateTime(item.dataAt, 'Europe/Ljubljana')}`);
  return lines.join('\n');
}

export function renderDigest(items: readonly DigestItem[], ctx: DigestContext): RenderedDigest {
  const subject = digestSubject(items, ctx.appName);
  const summary = digestSummary(items);
  const checked = formatLocalDateTime(ctx.checkedAt, 'Europe/Ljubljana');
  const html = `<!doctype html>
<html lang="sl"><body style="margin:0;padding:0;background:#f1f3f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:12px;padding:20px 24px">
  <tr><td style="font-size:20px;font-weight:700;padding-bottom:4px">Leti — ${esc(summary)}</td></tr>
  <tr><td style="font-size:13px;color:${EMAIL_MUTED};padding-bottom:8px">Preverjeno ${esc(checked)} (Europe/Ljubljana). Cene so take, kot jih je ob preverjanju pokazal vir; ob rezervaciji preveri znova.</td></tr>
  ${items.map((i) => renderItemHtml(i, ctx)).join('\n')}
  <tr><td style="font-size:12px;color:${EMAIL_MUTED};padding-top:14px">Ta dopis dobivaš, ker si lastnik ali prejemnik iskanja v ${esc(ctx.appName)}. Prejemnike ureja lastnik iskanja v aplikaciji: <a href="${esc(ctx.baseUrl)}/flight-deals" style="color:#1f6feb">${esc(ctx.baseUrl)}/flight-deals</a></td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    `${subject}`,
    `Preverjeno ${checked} (Europe/Ljubljana).`,
    '',
    ...items.map((i) => renderItemText(i, ctx)),
    '',
    `Prejemnike ureja lastnik iskanja: ${ctx.baseUrl}/flight-deals`,
  ].join('\n\n');
  return { subject, html, text };
}
