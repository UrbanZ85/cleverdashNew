import { Component, ElementRef, OnDestroy, computed, effect, inject, input, viewChild } from '@angular/core';
import { CategoryScale, Chart, LineController, LineElement, LinearScale, PointElement, Tooltip, type ChartConfiguration } from 'chart.js';
import { ThemeService } from '../../core/theme/theme.service.js';
import type { HistoryPoint } from './flight-deals.model.js';
import { chartPoints, formatPrice } from './flight-deals.model.js';

// Graf zgodovine cen ene ponudbe (US3). Lasten, majhen ovoj nad Chart.js — `features/meteo/charts`
// je v drugem modulu in ga ni dovoljeno uvoziti (člen I), dvig v `shared/` pa bi bil sprememba
// obstoječega modula (research.md §13). Isti prijemi kot tam: `animation: false`, `effect()` +
// `update('none')`, barve iz teme (canvas CSS spremenljivk ne bere), `spanGaps: false` — vrzel
// (NI VEČ NA VOLJO) ostane vrzel.

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip);

const LIGHT = { line: '#1f6feb', grid: '#e5e7eb', tick: '#6b7280' };
const DARK = { line: '#4d94ff', grid: '#2a313c', tick: '#9aa3b2' };

@Component({
  selector: 'app-flight-price-chart',
  standalone: true,
  template: `
    <figure [style.height.px]="heightPx()">
      <canvas #canvas role="img" [attr.aria-label]="'Zgodovina cene, ' + history().length + ' točk'"></canvas>
    </figure>
  `,
  styles: [
    `
      figure {
        margin: 0;
        position: relative;
        width: 100%;
      }
    `,
  ],
})
export class FlightPriceChartComponent implements OnDestroy {
  private readonly theme = inject(ThemeService);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart: Chart<'line'> | null = null;
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');

  readonly history = input.required<HistoryPoint[]>();
  readonly currency = input('EUR');
  readonly heightPx = input(200);

  private readonly points = computed(() => chartPoints(this.history()));

  constructor() {
    effect(() => {
      const { labels, values } = this.points();
      const dark = this.theme.current() === 'dark' || (this.theme.current() === 'system' && this.media.matches);
      const palette = dark ? DARK : LIGHT;
      const currency = this.currency();
      const config: ChartConfiguration<'line'> = {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Cena',
              data: values,
              borderColor: palette.line,
              backgroundColor: palette.line,
              pointRadius: 3,
              tension: 0,
              spanGaps: false,
              stepped: 'before',
            },
          ],
        },
        options: {
          animation: false,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => (ctx.parsed.y === null ? 'ni na voljo' : formatPrice({ amount: ctx.parsed.y, currency })),
              },
            },
          },
          scales: {
            x: { ticks: { color: palette.tick, maxRotation: 0, autoSkip: true }, grid: { color: palette.grid } },
            y: { ticks: { color: palette.tick, callback: (v) => formatPrice({ amount: Number(v), currency }) }, grid: { color: palette.grid } },
          },
        },
      };
      if (!this.chart) {
        this.chart = new Chart(this.canvas().nativeElement, config);
      } else {
        this.chart.data = config.data;
        this.chart.options = config.options ?? {};
        this.chart.update('none');
      }
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
    this.chart = null;
  }
}
