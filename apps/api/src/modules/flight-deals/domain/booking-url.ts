// Varno ravnanje s povezavami do rezervacije (spec.md, edge case "povezava kaže na drugo domeno").
//
// Prikaže se samo povezava, katere gostitelj pripada viru ponudbe. Vse ostalo — druga domena,
// `javascript:`, relativna pot brez osnove — je `null`. Vir je lahko kompromitiran ali pa
// napačno razčlenjen; ponudba brez povezave je slabša izkušnja, ponudba s tujo povezavo pa je
// napaka varnosti.

export function sanitizeBookingUrl(url: string | null | undefined, allowedHosts: readonly string[]): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const host = parsed.hostname.toLowerCase();
  const ok = allowedHosts.some((allowed) => {
    const a = allowed.toLowerCase();
    return host === a || host.endsWith(`.${a}`);
  });
  return ok ? parsed.toString() : null;
}
