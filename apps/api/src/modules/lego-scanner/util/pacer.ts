// Razmik med zaporednimi klici enega vira (vljudnost, člen VIII). Petnajst vrstic lastne kode: modul
// ne sme uvažati `flight-deals` (člen I), `platform/` pa take pomožne funkcije nima.

export function createPacer(minGapMs: number): () => Promise<void> {
  let last = 0;
  let chain: Promise<void> = Promise.resolve();
  return () => {
    chain = chain.then(async () => {
      const wait = last + minGapMs - Date.now();
      if (wait > 0) await new Promise<void>((resolve) => setTimeout(resolve, wait));
      last = Date.now();
    });
    return chain;
  };
}
