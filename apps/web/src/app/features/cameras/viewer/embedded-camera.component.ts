import {
  Component,
  ElementRef,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
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
        [style.width]="frameStyle().width"
        [style.height]="frameStyle().height"
        [style.transform]="frameStyle().transform"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        referrerpolicy="strict-origin-when-cross-origin"
        [attr.scrolling]="previewWidth === null ? null : 'no'"
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
       padel na privzetih 150 px za iframe in prikaz kamere bi bil ozek pas.
       Lastnost overflow: hidden je zaradi predogleda: okvir je tam širši in višji od
       gostitelja (pomanjša ga šele transform), brez tega pa bi njegov nepomanjšani obseg
       gostitelju narisal drsnike okoli slike. */
    :host { display: block; height: 100%; overflow: hidden; }
    /* Širino, višino in merilo nastavi frameStyle() — brez predogledne širine je to
       100% x 100% brez pomanjšanja, torej enako kot prej v polnem prikazu. Izhodišče
       pretvorbe je LEVI ZGORNJI kot, ker se okvir meri od tam navzdol/desno. */
    .embedded-camera-frame { border: 0; transform-origin: top left; }
    .embedded-camera-message { padding: var(--cd-space-3); font-size: var(--cd-font-size-sm); line-height: 1.5; }
  `,
})
export class EmbeddedCameraComponent implements OnChanges, OnInit, OnDestroy {
  @Input({ required: true }) url!: string;
  /**
   * Logična širina vdelane strani v px, PREDEN se ta pomanjša na velikost gostitelja
   * (`null` = brez pomanjšanja; okvir dobi velikost gostitelja, kot ga potrebuje polni
   * prikaz). Strani kamer so pisane za širino brskalnika, ne za ploščico: v ~490 px širokem
   * okvirju se izriše samo levi zgornji kot strani, z drsniki okoli. Vrednost pomeni
   * "izriši stran, kot bi imela toliko px širok brskalnik, potem pa jo v celoti pomanjšaj v
   * okvir" — šele tako je v predogledu videti CELA slika kamere in ne njen izsek. Pri predogledu je
   * hkrati izklopljeno drsenje po vdelani strani (`scrolling="no"`): v ploščico se ne
   * drsa, ploščica se odpre. V polnem prikazu drsenje OSTANE — tam je vdelana stran
   * namenjena uporabi.
   */
  @Input() previewWidth: number | null = null;

  // Atributa `allow` in `referrerpolicy` sta skupna z vtičnikom vrste iframe na nadzorni
  // plošči — brez tega bi ista vdelava v enem zaslonu delovala, v drugem pa ne. Zapisana sta
  // STATIČNO in ne kot vezava, ker Angular vezavo teh dveh na iframe zavrne z NG0910 in se
  // vdelava sploh ne izriše. Kanonični vrednosti sta v core/embeds/embed-address.ts,
  // ujemanje čuva tests/unit/embed-iframe-attributes.spec.ts.

  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);

  /** `previewWidth` prezrcaljen v signal — `frameStyle()` je računani signal in se ob
   * spremembi navadnega @Input sam po sebi ne bi osvežil. */
  private readonly logicalWidth = signal<number | null>(null);
  /** Izmerjena velikost gostitelja; brez nje merila ni mogoče izračunati. */
  private readonly hostSize = signal({ width: 0, height: 0 });
  private resizeObserver?: ResizeObserver;

  /**
   * Velikost okvirja in njegovo merilo. Merilo je razmerje IZMERJENE širine gostitelja do
   * logične širine, logična višina pa je izpeljana iz istega merila — pomanjšani okvir zato
   * natanko pokrije gostitelja: brez praznih robov in brez prelivanja čez ploščico.
   */
  readonly frameStyle = computed(() => {
    const logicalWidth = this.logicalWidth();
    const { width, height } = this.hostSize();
    // Brez predogledne širine ali brez meritve (prvi izris, okolje brez ResizeObserverja)
    // ostane vedenje polnega prikaza. Manjkajoča meritev nikoli ne pomeni praznega okvirja.
    if (logicalWidth === null || logicalWidth <= 0 || width <= 0 || height <= 0) {
      return { width: '100%', height: '100%', transform: 'none' };
    }
    const scale = width / logicalWidth;
    return {
      width: `${logicalWidth}px`,
      height: `${Math.round(height / scale)}px`,
      transform: `scale(${scale})`,
    };
  });

  readonly safeUrl = signal<SafeResourceUrl | null>(null);
  readonly state = signal<EmbedState>('checking');
  /** Gostitelj iz naslova — sporočilo o zavrnitvi ga mora imenovati, sicer uporabnik ne ve,
   * kaj naj doda na seznam. */
  readonly host = signal<string | null>(null);

  /** Merjenje teče samo pri predogledu (polni prikaz okvir razteza s CSS-om in meritve ne
   * potrebuje). ResizeObserver, ne enkratna meritev: širina ploščice se spremeni ob obratu
   * naprave in ob preklopu števila stolpcev v mreži, in okvir mora slediti. */
  ngOnInit(): void {
    if (this.previewWidth === null || typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      // Povratni klic ResizeObserverja teče IZVEN Angularjeve cone: zapis v signal bi pogled
      // označil za osvežitev, a je nihče ne bi sprožil in okvir bi ostal pri prvi velikosti.
      this.zone.run(() => this.hostSize.set({ width: box.width, height: box.height }));
    });
    this.resizeObserver.observe(this.hostElement.nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  async ngOnChanges(): Promise<void> {
    this.logicalWidth.set(this.previewWidth);
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
