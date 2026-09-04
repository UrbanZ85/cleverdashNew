import { Component, computed, input, signal } from '@angular/core';
import { IonButton, IonIcon, IonPopover, IonContent } from '@ionic/angular/standalone';
import { helpTopic, type HelpTopic, type HelpTopicId } from './help-topics.js';

// Znak "?" ob naslovu nastavitve, ki odpre pojasnilo.
//
// Pojavno okno in ne stalno besedilo: pojasnil je devetnajst in bi zaslon nastavitev
// spremenila v priročnik. Kratek namig ob polju ostane, tu je podrobnost — kaj nastavitev
// je, kako se nastavi in kaj velja, če je ne nastaviš.
//
// Vsebina pride iz `help-topics.ts`, ki je edini vir teh besedil; komponenta sprejme samo
// ključ, ki tam obstaja (tip `HelpTopicId`), zato napačna vrednost ne prevede.
@Component({
  selector: 'app-help',
  standalone: true,
  imports: [IonButton, IonIcon, IonPopover, IonContent],
  template: `
    <ion-button
      fill="clear"
      size="small"
      class="help-trigger"
      [attr.aria-label]="'Pojasnilo: ' + topicData().title"
      (click)="open($event)"
    >
      <ion-icon slot="icon-only" name="help-circle-outline" aria-hidden="true"></ion-icon>
    </ion-button>

    <ion-popover
      [isOpen]="isOpen()"
      [event]="anchor()"
      (didDismiss)="isOpen.set(false)"
      [showBackdrop]="true"
      class="help-popover"
    >
      <ng-template>
        <ion-content class="ion-padding">
          <h3 class="help-title">{{ topicData().title }}</h3>
          <p class="help-what">{{ topicData().what }}</p>

          <h4 class="help-subtitle">Kako se nastavi</h4>
          <ul class="help-list">
            @for (step of topicData().how; track step) {
              <li>{{ step }}</li>
            }
          </ul>

          @if (topicData().ifEmpty; as fallback) {
            <p class="help-note"><strong>Če pustiš prazno:</strong> {{ fallback }}</p>
          }
          @if (topicData().example; as example) {
            <p class="help-note"><strong>Primer:</strong> {{ example }}</p>
          }
        </ion-content>
      </ng-template>
    </ion-popover>
  `,
  styles: `
    :host {
      display: inline-flex;
      vertical-align: middle;
    }
    .help-trigger {
      --padding-start: 4px;
      --padding-end: 4px;
      --color: var(--cd-text-muted);
      height: 24px;
      margin: 0;
    }
    .help-trigger:hover {
      --color: var(--ion-color-primary);
    }
    .help-popover {
      --width: 340px;
      --max-height: 70vh;
      --backdrop-opacity: 0.2;
    }
    .help-title {
      margin: 0 0 var(--cd-space-2);
      font-size: var(--cd-font-size-md);
      font-weight: 650;
    }
    .help-what {
      margin: 0 0 var(--cd-space-3);
      font-size: var(--cd-font-size-sm);
      line-height: 1.55;
      color: var(--ion-text-color);
    }
    .help-subtitle {
      margin: 0 0 var(--cd-space-1);
      font-size: var(--cd-font-size-xs);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--cd-text-muted);
    }
    .help-list {
      margin: 0;
      padding-left: 1.1rem;
      display: grid;
      gap: var(--cd-space-1);
    }
    .help-list li {
      font-size: var(--cd-font-size-sm);
      line-height: 1.5;
    }
    .help-note {
      margin: var(--cd-space-3) 0 0;
      padding-top: var(--cd-space-2);
      border-top: 1px solid var(--cd-divider);
      font-size: var(--cd-font-size-sm);
      line-height: 1.5;
      color: var(--cd-text-muted);
    }
  `,
})
export class HelpButtonComponent {
  readonly topic = input.required<HelpTopicId>();

  protected readonly isOpen = signal(false);
  protected readonly anchor = signal<Event | undefined>(undefined);
  protected readonly topicData = computed<HelpTopic>(() => helpTopic(this.topic()));

  protected open(event: Event): void {
    // Popover se mora usidrati ob kliknjeni gumb, ne na sredino zaslona — Ionic za to
    // pričakuje sam dogodek.
    this.anchor.set(event);
    this.isOpen.set(true);
  }
}
