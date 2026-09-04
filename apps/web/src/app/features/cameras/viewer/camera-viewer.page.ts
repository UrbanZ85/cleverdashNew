import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { IonButton, IonContent } from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../../shared/layout/page-header.component.js';
import { apiUrl } from '../../../core/api/api-base.js';
import { SettingsStore } from '../../../core/settings/settings.store.js';
import { NetworkStatusService, shouldAutoplayLiveStream } from '../../../core/network/network-status.service.js';
import { EmbeddedCameraComponent } from './embedded-camera.component.js';

type CameraType = 'snapshot' | 'mjpeg' | 'hls' | 'iframe' | 'snapshot+iframe';

interface CameraDetail {
  id: string;
  name: string;
  type: CameraType;
  previewUrl: string;
  fullUrl: string | null;
}

// US2 (P2): celozaslonski prikaz. Če vrsta ponuja živi tok (`iframe`, `snapshot+iframe`,
// `mjpeg`, `hls`), se ta predvaja namesto statičnega posnetka (FR-012); tok se ustavi ob
// vrnitvi v mrežo (`ngOnDestroy`). Story 4 scenarij 5: če je kamera medtem izbrisana na
// drugi napravi, se prikaz razumljivo zapre, ne obstane v napaki.
@Component({
  selector: 'app-camera-viewer-page',
  standalone: true,
  imports: [PageHeaderComponent, IonButton, IonContent, EmbeddedCameraComponent],
  template: `
    <app-page-header [title]="camera()?.name ?? 'Kamera'" backRoute="/cameras" backLabel="Kamere">
    </app-page-header>
    <ion-content class="viewer-content">
      @if (deleted()) {
        <p class="viewer-message">Ta kamera je bila medtem odstranjena.</p>
      } @else if (camera(); as cam) {
        @switch (cam.type) {
          @case ('iframe') {
            <app-embedded-camera [url]="cam.previewUrl"></app-embedded-camera>
          }
          @case ('snapshot+iframe') {
            @if (autoplayLive()) {
              <app-embedded-camera [url]="cam.fullUrl ?? cam.previewUrl"></app-embedded-camera>
            } @else {
              <img [src]="snapshotUrl()" [alt]="cam.name" class="viewer-image" />
              <ion-button expand="block" (click)="confirmLivePlayback()">Predvajaj v živo</ion-button>
            }
          }
          @case ('mjpeg') {
            @if (autoplayLive()) {
              <img [src]="streamUrl()" [alt]="cam.name" class="viewer-image" />
            } @else {
              <ion-button expand="block" (click)="confirmLivePlayback()">Predvajaj v živo</ion-button>
            }
          }
          @case ('hls') {
            @if (autoplayLive()) {
              <video #hlsVideo class="viewer-image" controls autoplay muted></video>
            } @else {
              <ion-button expand="block" (click)="confirmLivePlayback()">Predvajaj v živo</ion-button>
            }
          }
          @default {
            <img [src]="snapshotUrl()" [alt]="cam.name" class="viewer-image" />
          }
        }
      }
    </ion-content>
  `,
  styles: `
    .viewer-content { --padding-top: 0; }
    .viewer-image { width: 100%; height: 100%; object-fit: contain; }
    .viewer-message { text-align: center; margin-top: 2rem; }
  `,
})
export class CameraViewerPage implements OnInit, OnDestroy {
  @ViewChild('hlsVideo') hlsVideoRef?: ElementRef<HTMLVideoElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly network = inject(NetworkStatusService);

  readonly camera = signal<CameraDetail | null>(null);
  readonly deleted = signal(false);
  readonly snapshotUrl = signal('');
  readonly streamUrl = signal('');
  readonly autoplayLive = signal(true);

  private pollTimer?: ReturnType<typeof setInterval>;
  private hlsInstance?: { destroy: () => void };
  private readonly settingsStore = inject(SettingsStore);
  private dataSaverEnabled = true;

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('cameraId');
    if (!id) {
      this.deleted.set(true);
      return;
    }

    // Ob napaki shramba obdrži privzetek (vklopljeno) — Assumptions, spec.md.
    await this.settingsStore.ensureLoaded();
    this.dataSaverEnabled = this.settingsStore.settings().cameraDataSaverEnabled;

    try {
      const cam = await firstValueFrom(this.http.get<CameraDetail>(apiUrl(`/cameras/${id}`), { withCredentials: true }));
      this.camera.set(cam);
      this.snapshotUrl.set(`${apiUrl(`/cameras/${id}/snapshot`)}?t=${Date.now()}`);
      this.streamUrl.set(apiUrl(`/cameras/${id}/stream`));
      // Story 7, sprejemni scenarij 2: na mobilnem omrežju s prihrankom se živi tok NE
      // zažene samodejno — uporabnik ga mora izrecno potrditi (confirmLivePlayback()).
      this.autoplayLive.set(shouldAutoplayLiveStream(this.network.kind(), this.dataSaverEnabled));

      if (cam.type === 'snapshot' || cam.type === 'snapshot+iframe') {
        this.pollTimer = setInterval(() => this.refreshOrDetectDeletion(id), 5000);
      }
      if (cam.type === 'hls' && this.autoplayLive()) {
        await this.attachHls(this.streamUrl());
      }
    } catch (err: unknown) {
      if (this.isNotFound(err)) this.deleted.set(true);
    }
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.hlsInstance?.destroy();
  }

  confirmLivePlayback(): void {
    this.autoplayLive.set(true);
    const cam = this.camera();
    if (cam?.type === 'hls') void this.attachHls(this.streamUrl());
  }

  close(): void {
    void this.router.navigate(['/cameras']);
  }

  private async refreshOrDetectDeletion(id: string): Promise<void> {
    try {
      await firstValueFrom(this.http.get(apiUrl(`/cameras/${id}/health`), { withCredentials: true }));
      this.snapshotUrl.set(`${apiUrl(`/cameras/${id}/snapshot`)}?t=${Date.now()}`);
    } catch (err) {
      if (this.isNotFound(err)) {
        this.deleted.set(true);
        if (this.pollTimer) clearInterval(this.pollTimer);
      }
    }
  }

  private isNotFound(err: unknown): boolean {
    return typeof err === 'object' && err !== null && 'status' in err && (err as { status: number }).status === 404;
  }

  private async attachHls(url: string): Promise<void> {
    const video = this.hlsVideoRef?.nativeElement;
    if (!video) return;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari/iOS: HLS je nativno podprt, hls.js ni potreben (research.md §15).
      video.src = url;
      return;
    }
    const { default: Hls } = await import('hls.js');
    if (!Hls.isSupported()) return;
    const hls = new Hls();
    hls.loadSource(url);
    hls.attachMedia(video);
    this.hlsInstance = hls;
  }
}
