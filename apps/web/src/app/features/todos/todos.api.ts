import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../../core/api/api-base.js';
import type {
  MemberRole,
  TodoCurrentResponse,
  TodoList,
  TodoListsResponse,
} from './todos.model.js';

// Odjemalec modula "Opravila". Uvaža samo iz `core/` in iz lastne mape — nikoli iz druge
// funkcionalnosti pod `features/` (člen I).
//
// Vsaka mutacija vrne CELO novo stanje seznama, zato tu ni delnih posodobitev in odjemalcu ni
// treba ugibati novega vrstnega reda po odkljukanju: opravljeno pade na dno in strežnik že ve,
// kam (člen XI).

@Injectable({ providedIn: 'root' })
export class TodosApi {
  private readonly http = inject(HttpClient);

  private readonly opts = { withCredentials: true } as const;

  private lists(path = ''): string {
    return apiUrl(`/todos/lists${path}`);
  }

  listAll(options: { includeTasks?: boolean } = {}): Promise<TodoListsResponse> {
    const suffix = options.includeTasks ? '?includeTasks=true' : '';
    return firstValueFrom(this.http.get<TodoListsResponse>(this.lists(suffix), this.opts));
  }

  /** Branje za ploščico. `listId` je pripeti seznam iz `Settings.tiles[].config` — strežnik o
   * pripetosti ne ve ničesar in je ne hrani. */
  current(listId?: string | null): Promise<TodoCurrentResponse> {
    const suffix = listId ? `?listId=${encodeURIComponent(listId)}` : '';
    return firstValueFrom(
      this.http.get<TodoCurrentResponse>(apiUrl(`/todos/current${suffix}`), this.opts),
    );
  }

  get(listId: string): Promise<TodoList> {
    return firstValueFrom(this.http.get<TodoList>(this.lists(`/${listId}`), this.opts));
  }

  createList(title: string): Promise<TodoList> {
    return firstValueFrom(this.http.post<TodoList>(this.lists(), { title }, this.opts));
  }

  /** Izpuščeno polje pomeni "ne spreminjaj" — enak dogovor kot pri `PUT /settings`. */
  updateList(listId: string, patch: { title?: string; locked?: boolean }): Promise<TodoList> {
    return firstValueFrom(this.http.patch<TodoList>(this.lists(`/${listId}`), patch, this.opts));
  }

  /** Vrne `{ deleted: true }`, ne 204 — glej opombo o idempotentnosti v pogodbi. */
  deleteList(listId: string): Promise<{ deleted: boolean }> {
    return firstValueFrom(
      this.http.delete<{ deleted: boolean }>(this.lists(`/${listId}`), this.opts),
    );
  }

  /** Prilepljeno večvrstično besedilo pošlje kot več naslovov — po eno opravilo na vrstico. */
  addTasks(listId: string, titles: string[], dueDate?: string | null): Promise<TodoList> {
    const body: { titles: string[]; dueDate?: string | null } = { titles };
    if (dueDate !== undefined) body.dueDate = dueDate;
    return firstValueFrom(this.http.post<TodoList>(this.lists(`/${listId}/tasks`), body, this.opts));
  }

  updateTask(
    listId: string,
    taskId: string,
    patch: { done?: boolean; title?: string; dueDate?: string | null },
  ): Promise<TodoList> {
    return firstValueFrom(
      this.http.patch<TodoList>(this.lists(`/${listId}/tasks/${taskId}`), patch, this.opts),
    );
  }

  deleteTask(listId: string, taskId: string): Promise<{ deleted: boolean; list: TodoList }> {
    return firstValueFrom(
      this.http.delete<{ deleted: boolean; list: TodoList }>(
        this.lists(`/${listId}/tasks/${taskId}`),
        this.opts,
      ),
    );
  }

  /** Pošlje CEL vrstni red, ne relativnega premika (research.md §10). */
  reorder(listId: string, taskIds: string[]): Promise<TodoList> {
    return firstValueFrom(
      this.http.put<TodoList>(this.lists(`/${listId}/order`), { taskIds }, this.opts),
    );
  }

  clearCompleted(listId: string): Promise<{ removed: number; list: TodoList }> {
    return firstValueFrom(
      this.http.post<{ removed: number; list: TodoList }>(
        this.lists(`/${listId}/tasks/clear-completed`),
        {},
        this.opts,
      ),
    );
  }

  setMember(listId: string, userId: string, role: MemberRole): Promise<TodoList> {
    return firstValueFrom(
      this.http.put<TodoList>(this.lists(`/${listId}/members/${userId}`), { role }, this.opts),
    );
  }

  removeMember(listId: string, userId: string): Promise<{ removed: boolean; list: TodoList | null }> {
    return firstValueFrom(
      this.http.delete<{ removed: boolean; list: TodoList | null }>(
        this.lists(`/${listId}/members/${userId}`),
        this.opts,
      ),
    );
  }

  /** Pobriše oznako "novo" za klicatelja. Za lastnika je no-op. */
  markSeen(listId: string): Promise<TodoList> {
    return firstValueFrom(this.http.post<TodoList>(this.lists(`/${listId}/seen`), {}, this.opts));
  }
}
