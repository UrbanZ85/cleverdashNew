import type { InputSignal, WritableSignal } from '@angular/core';

// Pogodba med čarovnikom (features/scanners/scanner-wizard.page.ts) in obrazcem TIPA (2. korak).
// Komponenta tipa, registrirana v `scanner-ui.registry.ts` kot `configComponent`, ta vmesnik
// izpolni: čarovnik ji poda `initial` (pri urejanju) in pred shranjevanjem prebere `config()` ter
// pokliče `validate()` — slovenski stavek ali `null`. Strežnik nastavitve preveri še enkrat po
// shemi tipa; obrazec je samo prva, prijaznejša mreža.

export interface ScannerConfigForm {
  /** Začetne nastavitve pri urejanju; `null` pri ustvarjanju. */
  initial: InputSignal<Record<string, unknown> | null>;
  /** Trenutne nastavitve, kot jih bo čarovnik poslal v `config`. */
  config: WritableSignal<Record<string, unknown>>;
  /** Prva napaka v slovenščini ali `null`, kadar je vnos v redu. */
  validate(): string | null;
}
