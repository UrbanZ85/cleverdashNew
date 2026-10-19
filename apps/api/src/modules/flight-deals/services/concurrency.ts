// Omejena vzporednost in premor med klici (FR-025, člen VIII). Petnajst vrstic lastne kode
// namesto odvisnosti `p-limit` (research.md §17).

export interface Semaphore {
  run<T>(task: () => Promise<T>): Promise<T>;
}

export function createSemaphore(limit: number): Semaphore {
  let active = 0;
  const queue: Array<() => void> = [];
  const release = () => {
    active -= 1;
    queue.shift()?.();
  };
  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      if (active >= limit) await new Promise<void>((resolve) => queue.push(resolve));
      active += 1;
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
}

/** Zaporedni klici z najmanjšim razmikom — za neuradni vir (500 ms kot `@2bad/ryanair`). */
export function createPacer(minGapMs: number, sleep: (ms: number) => Promise<void> = defaultSleep): () => Promise<void> {
  let last = 0;
  let chain: Promise<void> = Promise.resolve();
  return () => {
    chain = chain.then(async () => {
      const wait = last + minGapMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
    });
    return chain;
  };
}

export function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
