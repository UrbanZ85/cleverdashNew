#!/usr/bin/env node
/**
 * Spike pokritosti Travelpayouts/Aviasales Data API za letališča iz naročila (015, quickstart.md §2,
 * research.md §4). ROČNA skripta — ne teče v testih in ne v gradnji.
 *
 *   FLIGHT_TRAVELPAYOUTS_TOKEN=… node apps/api/scripts/spike-travelpayouts.mjs LJU ZAG TRS VCE TSF GRZ KLU
 *
 * Za vsako letališče in naslednje štiri mesece pokliče `prices_for_dates` (kamor koli, povratno,
 * direktno) in izpiše: število vrstic, delež direktnih, najstarejši `search_date` v povezavi, in
 * ali je `link` z `&marker=` še veljaven naslov. Rezultat se ročno prepiše v quickstart.md §2 in
 * odloči, ali lastnik vklopi dodatni vir (Ryanair).
 *
 * Žeton gre v glavo, ne v URL (člen IV); skripta ničesar ne piše v bazo.
 */
const token = process.env.FLIGHT_TRAVELPAYOUTS_TOKEN;
if (!token) {
  console.error('Manjka FLIGHT_TRAVELPAYOUTS_TOKEN.');
  process.exit(1);
}
const base = process.env.FLIGHT_TRAVELPAYOUTS_URL ?? 'https://api.travelpayouts.com';
const airports = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['LJU', 'ZAG', 'TRS', 'VCE', 'TSF', 'GRZ', 'KLU'];
const months = [];
const now = new Date();
for (let i = 0; i < 4; i += 1) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
  months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
}

function searchDateOf(link) {
  const m = /search_date=(\d{2})(\d{2})(\d{4})/.exec(link ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

async function query(origin, month) {
  const url = new URL('/aviasales/v3/prices_for_dates', base);
  url.searchParams.set('origin', origin);
  url.searchParams.set('departure_at', month);
  url.searchParams.set('return_at', month);
  url.searchParams.set('one_way', 'false');
  url.searchParams.set('direct', 'false');
  url.searchParams.set('currency', 'eur');
  url.searchParams.set('sorting', 'price');
  url.searchParams.set('limit', '1000');
  const res = await fetch(url, { headers: { 'X-Access-Token': token, Accept: 'application/json' } });
  const remaining = res.headers.get('x-rate-limit-remaining');
  if (!res.ok) return { error: `HTTP ${res.status}`, remaining };
  const body = await res.json();
  if (!body.success) return { error: body.error ?? 'success:false', remaining };
  return { rows: body.data, remaining };
}

console.log(`Mesec | Letališče | Vrstic | Direktnih | Destinacij | Najstarejši podatek | Prevozniki`);
for (const origin of airports) {
  for (const month of months) {
    const result = await query(origin, month);
    if (result.error) {
      console.log(`${month} | ${origin} | NAPAKA ${result.error} (remaining ${result.remaining ?? '?'})`);
      continue;
    }
    const rows = result.rows;
    const direct = rows.filter((r) => r.transfers === 0).length;
    const destinations = new Set(rows.map((r) => r.destination)).size;
    const dates = rows.map((r) => searchDateOf(r.link)).filter(Boolean).sort();
    const airlines = [...new Set(rows.map((r) => r.airline))].slice(0, 8).join(',');
    console.log(`${month} | ${origin} | ${rows.length} | ${direct} | ${destinations} | ${dates[0] ?? '—'} | ${airlines}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}
console.log('\nPreveri ročno: odpri eno povezavo `https://www.aviasales.com<link>&marker=<MARKER>` in potrdi, da iskanje nosi oznako.');
