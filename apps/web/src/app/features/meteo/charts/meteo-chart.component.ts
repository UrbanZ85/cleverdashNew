import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartConfiguration,
  type ChartDataset,
} from 'chart.js';
import { ThemeService } from '../../../core/theme/theme.service.js';

// Ena komponenta za VSE grafe tega zavihka (temperatura, padavine, veter, vlaga, tlak,
// obsevanje, sneg). Ločena komponenta na veličino bi pomenila sedemkrat isto vezavo na
// Chart.js in sedem mest, kjer je treba popraviti barvo osi.
//
// Zakaj Chart.js in ne lasten SVG: grafov je sedem, vsak z drugo osjo in enoto, in vsi
// potrebujejo namige ob dotiku (na telefonu je to edini način, da se odčita vrednost).
// Uvožene so SAMO uporabljene komponente knjižnice (`Chart.register` spodaj), ne cela
// knjižnica — Chart.js je zato v svežnju velik približno toliko kot dva grafa.
//
// Risanje je izven Angularjeve zaznave sprememb: `animation: false` in ročno posodabljanje
// prek `effect()`. Animiran graf bi ob vsakem koraku sprožil zaznavo sprememb (zone.js) in
// s tem 60 preračunov na sekundo za nič.
Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
);

export interface MeteoChartSeries {
  label: string;
  data: (number | null)[];
  kind: 'line' | 'bar';
  /** Vloga barve; konkretno vrednost izbere tema (glej `paletteFor`). */
  tone: 'temperature' | 'precipitation' | 'wind' | 'gust' | 'humidity' | 'pressure' | 'radiation' | 'snow' | 'total';
  /** Na katero os se veže. `right` je za drugo veličino v istem grafu (npr. vsota padavin). */
  axis?: 'left' | 'right';
  unit?: string;
  /** Zapolnjena ploskev pod črto — za obsevanje in vlago bere lažje kot gola črta. */
  fill?: boolean;
  /** Črtkano — za izpeljanke (vsota) in ne za meritev samo. */
  dashed?: boolean;
  /** Debelina črte; sunki vetra so tanjši od povprečja. */
  width?: number;
}

interface Palette {
  temperature: string;
  precipitation: string;
  wind: string;
  gust: string;
  humidity: string;
  pressure: string;
  radiation: string;
  snow: string;
  total: string;
}

/** Barve so tu in ne v CSS spremenljivkah, ker jih Chart.js riše na `<canvas>`, kamor CSS ne
 * seže. Sta dva nabora, ne en s prosojnostjo: na temnem ozadju je svetlejša različica edina,
 * ki je vidna, in obratno. */
const LIGHT_PALETTE: Palette = {
  temperature: '#d1495b',
  precipitation: '#2f6fb5',
  wind: '#2a9d8f',
  gust: '#8ecae6',
  humidity: '#5b6b7f',
  pressure: '#7d5ba6',
  radiation: '#e09f3e',
  snow: '#5a8fbe',
  total: '#94a3b8',
};

const DARK_PALETTE: Palette = {
  temperature: '#f2727f',
  precipitation: '#63a4ff',
  wind: '#4ecdc4',
  gust: '#9bd7ea',
  humidity: '#98a3b3',
  pressure: '#b79ae0',
  radiation: '#f0b95c',
  snow: '#8fc4f0',
  total: '#7d8899',
};

@Component({
  selector: 'app-meteo-chart',
  standalone: true,
  template: `
    <figure class="chart" [style.height.px]="heightPx()">
      <canvas #canvas [attr.aria-label]="title()" role="img"></canvas>
    </figure>
  `,
  styles: `
    .chart {
      position: relative;
      margin: 0;
      width: 100%;
    }
    canvas {
      display: block;
      width: 100% !important;
      height: 100% !important;
    }
  `,
})
export class MeteoChartComponent implements OnDestroy {
  private readonly theme = inject(ThemeService);
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  readonly title = input.required<string>();
  readonly labels = input.required<string[]>();
  readonly series = input.required<MeteoChartSeries[]>();
  readonly heightPx = input<number>(220);
  /** Zgornja meja leve osi — brez nje se os prilagodi edini vrednosti in 0,2 mm dežja je
   * videti kot naliv (glej `precipitationAxisMax` v core/meteo/meteo.model.ts). */
  readonly leftMax = input<number | null>(null);
  readonly leftMin = input<number | null>(null);
  /** Ali naj leva os obvezno vključi ničlo (padavine, obsevanje, sneg). */
  readonly leftBeginAtZero = input(false);

  /** Sistemska tema se lahko spremeni brez uporabnikovega dejanja (nastavitev "po sistemu"),
   * `<canvas>` pa se sam ne prebarva — barve osi in črt je treba nariati znova. */
  private readonly systemDark = signal(window.matchMedia('(prefers-color-scheme: dark)').matches);
  private readonly mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly onSystemThemeChange = (event: MediaQueryListEvent): void => this.systemDark.set(event.matches);

  private readonly isDark = computed(() => {
    const preference = this.theme.current();
    return preference === 'dark' || (preference === 'system' && this.systemDark());
  });

  private chart: Chart | null = null;

  constructor() {
    this.mediaQuery.addEventListener('change', this.onSystemThemeChange);

    effect(() => {
      // Odvisnosti učinka: podatki, oznake, meje osi in tema.
      const config = this.buildConfig(this.labels(), this.series(), this.isDark());
      const canvas = this.canvasRef().nativeElement;

      if (this.chart) {
        // Posodobitev in ne nov graf: nov `Chart` na istem elementu bi pustil prejšnjega
        // pripetega na `<canvas>` in Chart.js bi ob naslednjem risanju vrgel napako
        // "Canvas is already in use".
        this.chart.data = config.data;
        this.chart.options = config.options ?? {};
        this.chart.update('none');
        return;
      }
      this.chart = new Chart(canvas, config);
    });
  }

  ngOnDestroy(): void {
    this.mediaQuery.removeEventListener('change', this.onSystemThemeChange);
    this.chart?.destroy();
    this.chart = null;
  }

  private buildConfig(labels: string[], series: MeteoChartSeries[], dark: boolean): ChartConfiguration {
    const palette = dark ? DARK_PALETTE : LIGHT_PALETTE;
    const gridColor = dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(16, 21, 28, 0.08)';
    const tickColor = dark ? '#98a3b3' : '#5b6b7f';
    const usesRightAxis = series.some((s) => s.axis === 'right');

    const datasets: ChartDataset[] = series.map((s) => {
      const color = palette[s.tone];
      const base = {
        label: s.unit ? `${s.label} [${s.unit}]` : s.label,
        data: s.data,
        yAxisID: s.axis === 'right' ? 'right' : 'left',
        borderColor: color,
        backgroundColor: s.kind === 'bar' ? color : withAlpha(color, s.fill ? 0.22 : 0),
      };

      if (s.kind === 'bar') {
        return {
          ...base,
          type: 'bar' as const,
          borderWidth: 0,
          // Stolpci se dotikajo, ker gre za zaporedne ure brez vrzeli med njimi.
          categoryPercentage: 0.98,
          barPercentage: 0.94,
        };
      }

      return {
        ...base,
        type: 'line' as const,
        borderWidth: s.width ?? 2,
        borderDash: s.dashed ? [4, 3] : undefined,
        fill: s.fill ?? false,
        // Brez točk: pri 289 meritvah je črta iz točk črna packa. Točka se pokaže ob dotiku.
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: 0.25,
        // Vrzel v meritvah ostane vrzel in se NE premosti z ravno črto: premoščena vrzel je
        // laž o tem, da je postaja merila (člen VII).
        spanGaps: false,
      };
    });

    return {
      type: 'line',
      data: { labels, datasets },
      options: {
        animation: false,
        maintainAspectRatio: false,
        responsive: true,
        // Namig ob dotiku po celem navpičnem pasu — na telefonu je zadeti točno črto nemogoče.
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: series.length > 1,
            callbacks: {
              label: (item) => {
                const value = item.parsed.y;
                if (value === null || value === undefined) return `${item.dataset.label}: ni meritve`;
                return `${item.dataset.label}: ${formatNumber(value)}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: gridColor, display: false },
            ticks: {
              color: tickColor,
              autoSkip: true,
              maxRotation: 0,
              // Toliko oznak, da so berljive tudi na telefonu; Chart.js sam izbere katere.
              maxTicksLimit: 8,
            },
          },
          left: {
            position: 'left',
            beginAtZero: this.leftBeginAtZero(),
            suggestedMax: this.leftMax() ?? undefined,
            suggestedMin: this.leftMin() ?? undefined,
            grid: { color: gridColor },
            ticks: { color: tickColor, maxTicksLimit: 6 },
          },
          right: {
            display: usesRightAxis,
            position: 'right',
            beginAtZero: true,
            grid: { display: false },
            ticks: { color: tickColor, maxTicksLimit: 5 },
          },
        },
      },
    };
  }
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Decimalna vejica in največ ena decimalka — slovenski zapis (člen X). */
function formatNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
}
