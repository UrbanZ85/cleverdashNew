// Razmik med zaporednimi klici enega vira (vljudnost, člen VIII). Skupno vsem tipom skenerjev;
// `flight-deals` ima svojo različico z vstavljivim `sleep` (člen I: moduli se ne uvažajo).

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
