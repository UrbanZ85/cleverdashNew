import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonButton,
  IonIcon,
  IonBadge,
  AlertController,
} from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../../shared/layout/page-header.component.js';
import { apiUrl } from '../../../core/api/api-base.js';
import { CameraFormComponent, type CameraFormValue } from './camera-form.component.js';

interface CameraListItem extends CameraFormValue {
  id: string;
  order: number;
}

// Story 3 (P3, FR-030, FR-031) in Story 4 (P4, FR-032, FR-033): en zaslon, ki prikaže vse
// kamere (tudi neaktivne) in gostuje `<app-camera-form>` za dodajanje/urejanje. Vrstni red
// se spremeni z ↑/↓ gumboma — enak vzorec kot `tile-arrangement.component.ts`
// (research.md §7), ne povleci-in-spusti.
@Component({
  selector: 'app-camera-manage-page',
  standalone: true,
  imports: [
    PageHeaderComponent,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonButton,
    IonIcon,
    IonBadge,
    CameraFormComponent,
  ],
  template: `
    <app-page-header title="Urejanje kamer" backRoute="/cameras" backLabel="Kamere"></app-page-header>
    <ion-content class="ion-padding">
      @if (formOpen()) {
        <app-camera-form
          [camera]="editingCamera()"
          (saved)="onSaved()"
          (cancelled)="closeForm()"
        ></app-camera-form>
      } @else {
        <ion-button expand="block" (click)="openAddForm()">Dodaj kamero</ion-button>
        <ion-list>
          @for (camera of cameras(); track camera.id; let i = $index) {
            <ion-item>
              <ion-label>
                {{ camera.name }}
                @if (!camera.active) {
                  <ion-badge color="medium">Neaktivna</ion-badge>
                }
                <p>{{ camera.type }}</p>
              </ion-label>
              <ion-button fill="clear" size="small" [disabled]="i === 0" (click)="moveUp(i)">↑</ion-button>
              <ion-button fill="clear" size="small" [disabled]="i === cameras().length - 1" (click)="moveDown(i)">↓</ion-button>
              <ion-button fill="clear" size="small" (click)="openEditForm(camera)">
                <ion-icon slot="icon-only" name="create-outline"></ion-icon>
              </ion-button>
              <ion-button fill="clear" size="small" color="danger" (click)="confirmDelete(camera)">
                <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
              </ion-button>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
})
export class CameraManagePage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly alertController = inject(AlertController);

  readonly cameras = signal<CameraListItem[]>([]);
  readonly formOpen = signal(false);
  readonly editingCamera = signal<CameraFormValue | null>(null);

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  private async reload(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ cameras: CameraListItem[] }>(apiUrl('/cameras'), { withCredentials: true }),
      );
      this.cameras.set(res.cameras);
    } catch {
      this.cameras.set([]);
    }
  }

  openAddForm(): void {
    this.editingCamera.set(null);
    this.formOpen.set(true);
  }

  openEditForm(camera: CameraListItem): void {
    this.editingCamera.set(camera);
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.editingCamera.set(null);
  }

  async onSaved(): Promise<void> {
    this.closeForm();
    await this.reload();
  }

  async confirmDelete(camera: CameraListItem): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Izbriši kamero',
      message: `Kamera "${camera.name}" bo nepovratno izbrisana. Nadaljuješ?`,
      buttons: [
        { text: 'Prekliči', role: 'cancel' },
        {
          text: 'Izbriši',
          role: 'destructive',
          handler: () => void this.deleteCamera(camera.id),
        },
      ],
    });
    await alert.present();
  }

  private async deleteCamera(id: string): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(apiUrl(`/cameras/${id}`), { withCredentials: true }));
    } finally {
      await this.reload();
    }
  }

  async moveUp(index: number): Promise<void> {
    if (index === 0) return;
    await this.swapAndSave(index, index - 1);
  }

  async moveDown(index: number): Promise<void> {
    if (index === this.cameras().length - 1) return;
    await this.swapAndSave(index, index + 1);
  }

  private async swapAndSave(a: number, b: number): Promise<void> {
    const list = [...this.cameras()];
    [list[a], list[b]] = [list[b] as CameraListItem, list[a] as CameraListItem];
    this.cameras.set(list);

    // FR-035: `PUT /cameras/order` sprejme popoln seznam znotraj ENE skupine — grupiraj po
    // `groupId`, posodobi samo skupino, v kateri je bila zamenjava.
    const groupId = list[a]!.groupId;
    const idsInGroup = list.filter((c) => c.groupId === groupId).map((c) => c.id);
    await firstValueFrom(
      this.http.put(apiUrl('/cameras/order'), { groupId, cameraIds: idsInGroup }, { withCredentials: true }),
    );
    await this.reload();
  }
}
