import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../../../core/api/api-base.js';

interface EmbedHostsResponse {
  hosts: { host: string }[];
}

/** Zakaj vdelava (še) ni izrisana — vsak razlog ima svojo pot ven in zato svoje besedilo.
 * Prej sta se "gostitelj ni dovoljen" in "seznama ni bilo mogoče prebrati" izrisala kot
 * ISTO sporočilo, kar je pri iskanju vzroka kazalo v napačno smer. */
type EmbedState = 'checking' | 'allowed' | 'rejected' | 'unavailable' | 'invalid-url';

// research.md §5: odprava hrošča starega CleverDasha (`bypassSecurityTrustHtml` nad nizom,
// sestavljenim iz uporabniškega polja). Ta komponenta sprejme SAMO en, že preverjen naslov
// (nikoli HTML), in ga veže na iframe [src] prek `bypassSecurityTrustResourceUrl` — ne
// `bypassSecurityTrustHtml`. Gostitelj je preverjen dvoplastno: strežnik ob shranjevanju
// (FR-034) in tu, na odjemalcu, tik pred izrisom (obratovalna varovalka, ne nadomestek).
//
// Ta drugi pregled je tudi EDINA razlika med to vdelavo in vdelavo vtičnika na nadzorni
// plošči (plugin-tile.component.ts): ta pot pred izrisom počaka na strežnikov odgovor in ob
// neuspehu ne izriše ničesar, tista pa izriše naslov takoj. Enak naslov se zato lahko na
// nadzorni plošči vidi, tu pa ne — brez pojasnila je to videti kot pokvarjena kamera, zato
// vsako od stanj spodaj pove, kaj se je zgodilo in kaj storiti.
@Component({
  selector: 'app-embedded-camera',
  standalone: true,
  template: `
    @if (safeUrl(); as url) {
      <iframe
        [src]="url"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        referrerpolicy="strict-origin-when-cross-origin"
        loading="lazy"
        class="embedded-camera-frame"
      ></iframe>
    } @else if (state() === 'rejected') {
      <p class="embedded-camera-message">
        Vdelave ni mogoče prikazati: gostitelj “{{ host() }}” ni na seznamu dovoljenih.
        Dodaj ga pri urejanju te kamere (obrazec to ponudi ob shranjevanju).
      </p>
    } @else if (state() === 'unavailable') {
      <p class="embedded-camera-message">
        Seznama dovoljenih gostiteljev ni bilo mogoče prebrati, zato vdelava ni prikazana.
        Osveži stran; če se ponovi, strežnik ni dosegljiv.
      </p>
    } @else if (state() === 'invalid-url') {
      <p class="embedded-camera-message">Naslov te kamere ni veljaven URL.</p>
    }
  `,
  styles: `
    /* Višina 100% na okvirju brez višine na GOSTITELJU ne pomeni nič: odstotek se meri od
       starša, app-embedded-camera pa je privzeto inline element z višino auto — okvir bi
       padel na privzetih 150 px za iframe in prikaz kamere bi bil ozek pas. */
    :host { display: block; height: 100%; }
    .embedded-camera-frame { width: 100%; height: 100%; border: 0; }
    .embedded-camera-message { padding: var(--cd-space-3); font-size: var(--cd-font-size-sm); line-height: 1.5; }
  `,
})
export class EmbeddedCameraComponent implements OnChanges {
  @Input({ required: true }) url!: string;

  // Atributa `allow` in `referrerpolicy` sta skupna z vtičnikom vrste iframe na nadzorni
  // plošči — brez tega bi ista vdelava v enem zaslonu delovala, v drugem pa ne. Zapisana sta
  // STATIČNO in ne kot vezava, ker Angular vezavo teh dveh na iframe zavrne z NG0910 in se
  // vdelava sploh ne izriše. Kanonični vrednosti sta v core/embeds/embed-address.ts,
  // ujemanje čuva tests/unit/embed-iframe-attributes.spec.ts.

  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);

  readonly safeUrl = signal<SafeResourceUrl | null>(null);
  readonly state = signal<EmbedState>('checking');
  /** Gostitelj iz naslova — sporočilo o zavrnitvi ga mora imenovati, sicer uporabnik ne ve,
   * kaj naj doda na seznam. */
  readonly host = signal<string | null>(null);

  async ngOnChanges(): Promise<void> {
    this.safeUrl.set(null);
    this.state.set('checking');

    const hostname = this.hostnameOf(this.url);
    this.host.set(hostname);
    if (!hostname) {
      this.state.set('invalid-url');
      return;
    }

    const next = await this.checkHost(hostname);
    if (next === 'allowed') {
      this.safeUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.url));
    }
    this.state.set(next);
  }

  private hostnameOf(url: string): string | null {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  private async checkHost(hostname: string): Promise<EmbedState> {
    let hosts: { host: string }[];
    try {
      ({ hosts } = await firstValueFrom(
        this.http.get<EmbedHostsResponse>(apiUrl('/cameras/embed-hosts'), { withCredentials: true }),
      ));
    } catch {
      // Neuspel pregled NI dovoljenje: seznam je varovalka in ostane zaprta. Razlikuje se
      // od zavrnitve samo v sporočilu — in prav to je bila prej nevidna razlika.
      return 'unavailable';
    }
    const allowed = hosts.some((h) => hostname === h.host || hostname.endsWith(`.${h.host}`));
    return allowed ? 'allowed' : 'rejected';
  }
}
