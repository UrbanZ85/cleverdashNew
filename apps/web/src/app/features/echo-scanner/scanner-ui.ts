import { registerScannerUi } from '../../core/scanners/scanner-ui.registry.js';

// Prispevek testnega tipa `echo` k vmesniku skenerjev (016): obrazec za 2. korak čarovnika. Brez
// lastnega prikaza rezultatov — generični seznam zadošča. ENA vrstica v `apps/web/src/main.ts`.

export function registerEchoScannerUi(): void {
  registerScannerUi({
    type: 'echo',
    configComponent: () => import('./echo-config.component.js').then((m) => m.EchoConfigComponent),
  });
}
