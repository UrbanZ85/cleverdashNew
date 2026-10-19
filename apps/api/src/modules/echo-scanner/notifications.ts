import { emailSubject } from '../../platform/email/mailer.service.js';
import type { Money, NotifiableChangeType, NotificationHooks, NotificationItem, RenderContext, RenderedDigest } from '../../platform/scanner/types.js';

// Kavlja tipa `echo` za outbox jedra (016): `verify` vrne postavke, kot so (testni tip nima česa
// znova preverjati — rezultat je v generični shrambi, ki jo jedro že pozna); `render` sestavi
// preprost dopis. Dovolj, da je pot od dogodka do pošte preverjena od konca do konca (FR-046).

export interface EchoItem {
  scannerName: string;
  title: string;
  url: string | null;
  price: Money | null;
  previousPrice: Money | null;
  changeType: NotifiableChangeType;
}

interface EchoPayload {
  title?: string;
  url?: string | null;
  price?: Money | null;
  previousPrice?: Money | null;
}

const LABELS: Record<NotifiableChangeType, string> = { NEW: 'NOVO', PRICE_DOWN: 'POCENITEV', PRICE_UP: 'PODRAŽITEV', CHANGED: 'SPREMENJENO' };

function money(m: Money | null | undefined): string {
  return m ? `${m.amount} ${m.currency}` : '—';
}

export async function verifyEchoItems(items: NotificationItem[]): Promise<EchoItem[]> {
  return items.map((item) => {
    const payload = (item.payload ?? {}) as EchoPayload;
    return {
      scannerName: item.definitionName,
      title: payload.title ?? item.resultRef,
      url: payload.url ?? null,
      price: payload.price ?? null,
      previousPrice: payload.previousPrice ?? null,
      changeType: item.changeType,
    };
  });
}

export function renderEchoDigest(items: EchoItem[], ctx: RenderContext): RenderedDigest {
  const subject = emailSubject(ctx.appName, 'Skenerji', `${items.length} ${items.length === 1 ? 'sprememba' : items.length === 2 ? 'spremembi' : 'sprememb'} (echo)`);
  const rows = items.map((i) => {
    const change = i.previousPrice ? ` (prej ${money(i.previousPrice)})` : '';
    return `<li><strong>${LABELS[i.changeType]}</strong> · ${i.scannerName} · ${i.title} · ${money(i.price)}${change}</li>`;
  });
  const html = `<p>Testni skener je zaznal spremembe (${ctx.checkedAt.toISOString()}).</p><ul>${rows.join('')}</ul><p><a href="${ctx.baseUrl}/scanners">Odpri v ${ctx.appName}</a></p>`;
  const text = items.map((i) => `${LABELS[i.changeType]} · ${i.scannerName} · ${i.title} · ${money(i.price)}`).join('\n');
  return { subject, html, text };
}

export const echoNotificationHooks: NotificationHooks<EchoItem> = {
  verify: verifyEchoItems,
  render: renderEchoDigest,
};
