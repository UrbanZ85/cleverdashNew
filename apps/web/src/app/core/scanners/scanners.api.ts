import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../api/api-base.js';
import type {
  Limits,
  NotificationAdmin,
  ResultDetail,
  ResultList,
  ResultSort,
  Run,
  RunSummary,
  Scanner,
  ScannerInput,
  ScannerPatch,
  ScannerSummary,
  ScannerTypeAdmin,
  ScannerTypeInfo,
  SchedulePreset,
  TypeSchedule,
} from './scanners.model.js';

// Odjemalec jedra skenerjev (016). Živi v `core/`, ker ga uporabljajo generične strani
// (`features/scanners`) IN moduli, ki prispevajo svoj prikaz. Vse metode so Promise prek
// `firstValueFrom` (vzorec 010/013/015).

@Injectable({ providedIn: 'root' })
export class ScannersApi {
  private readonly http = inject(HttpClient);
  private readonly opts = { withCredentials: true } as const;

  private path(suffix = ''): string {
    return apiUrl(`/scanners${suffix}`);
  }

  types(): Promise<{ types: ScannerTypeInfo[]; presets: SchedulePreset[] }> {
    return firstValueFrom(this.http.get<{ types: ScannerTypeInfo[]; presets: SchedulePreset[] }>(this.path('/types'), this.opts));
  }

  list(type?: string): Promise<{ scanners: ScannerSummary[]; limits: Limits }> {
    const suffix = type ? `?type=${encodeURIComponent(type)}` : '';
    return firstValueFrom(this.http.get<{ scanners: ScannerSummary[]; limits: Limits }>(this.path(suffix), this.opts));
  }

  get(id: string): Promise<Scanner> {
    return firstValueFrom(this.http.get<Scanner>(this.path(`/${id}`), this.opts));
  }

  create(input: ScannerInput): Promise<Scanner> {
    return firstValueFrom(this.http.post<Scanner>(this.path(), input, this.opts));
  }

  update(id: string, patch: ScannerPatch): Promise<Scanner> {
    return firstValueFrom(this.http.patch<Scanner>(this.path(`/${id}`), patch, this.opts));
  }

  delete(id: string): Promise<{ deleted: boolean }> {
    return firstValueFrom(this.http.delete<{ deleted: boolean }>(this.path(`/${id}`), this.opts));
  }

  run(id: string): Promise<Run> {
    return firstValueFrom(this.http.post<Run>(this.path(`/${id}/run`), {}, this.opts));
  }

  runs(id: string, limit = 20): Promise<RunSummary[]> {
    return firstValueFrom(this.http.get<{ runs: RunSummary[] }>(this.path(`/${id}/runs?limit=${limit}`), this.opts)).then((r) => r.runs);
  }

  results(id: string, params: { sort?: ResultSort; includeUnavailable?: boolean; limit?: number } = {}): Promise<ResultList> {
    const search = new URLSearchParams();
    if (params.sort) search.set('sort', params.sort);
    if (params.includeUnavailable) search.set('includeUnavailable', 'true');
    if (params.limit) search.set('limit', String(params.limit));
    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    return firstValueFrom(this.http.get<ResultList>(this.path(`/${id}/results${suffix}`), this.opts));
  }

  result(id: string, resultId: string): Promise<ResultDetail> {
    return firstValueFrom(this.http.get<ResultDetail>(this.path(`/${id}/results/${resultId}`), this.opts));
  }

  // ─── administracija ───

  adminTypes(): Promise<{ types: ScannerTypeAdmin[]; email: { configured: boolean } }> {
    return firstValueFrom(this.http.get<{ types: ScannerTypeAdmin[]; email: { configured: boolean } }>(this.path('/admin/types'), this.opts));
  }

  typeSchedule(type: string): Promise<TypeSchedule> {
    return firstValueFrom(this.http.get<TypeSchedule>(this.path(`/admin/types/${type}/schedule`), this.opts));
  }

  updateTypeSchedule(type: string, patch: { enabled?: boolean; preset?: string; cronExpression?: string; timezone?: string }): Promise<TypeSchedule> {
    return firstValueFrom(this.http.put<TypeSchedule>(this.path(`/admin/types/${type}/schedule`), patch, this.opts));
  }

  adminRuns(params: { type?: string; limit?: number } = {}): Promise<{ runs: Run[]; active: Run[] }> {
    const search = new URLSearchParams();
    if (params.type) search.set('type', params.type);
    if (params.limit) search.set('limit', String(params.limit));
    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    return firstValueFrom(this.http.get<{ runs: Run[]; active: Run[] }>(this.path(`/admin/runs${suffix}`), this.opts));
  }

  adminRun(id: string): Promise<Run> {
    return firstValueFrom(this.http.get<Run>(this.path(`/admin/runs/${id}`), this.opts));
  }

  triggerRun(target: { type: string } | { scannerId: string }): Promise<Run> {
    return firstValueFrom(this.http.post<Run>(this.path('/admin/runs'), target, this.opts));
  }

  cancelRun(id: string): Promise<Run> {
    return firstValueFrom(this.http.post<Run>(this.path(`/admin/runs/${id}/cancel`), {}, this.opts));
  }

  adminNotifications(params: { type?: string; status?: string; runId?: string; limit?: number } = {}): Promise<NotificationAdmin[]> {
    const search = new URLSearchParams();
    if (params.type) search.set('type', params.type);
    if (params.status) search.set('status', params.status);
    if (params.runId) search.set('runId', params.runId);
    if (params.limit) search.set('limit', String(params.limit));
    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    return firstValueFrom(this.http.get<{ notifications: NotificationAdmin[] }>(this.path(`/admin/notifications${suffix}`), this.opts)).then(
      (r) => r.notifications,
    );
  }
}
