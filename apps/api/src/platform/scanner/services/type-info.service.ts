import type { Env } from '../../config/env.js';
import { ADMIN_SCOPE } from '../../auth/scopes.js';
import { SCANNER_SCOPES } from '../scopes.js';
import type { AnyScannerType } from '../types.js';

// `ScannerTypeInfo` iz pogodbe 016: kaj tip je, ali je v tej namestitvi vklopljen in ali ga
// klicatelj sme uporabljati (obsegi tipa ali skupna `scanners:*`, `admin` pokrije vse).

export interface TypeInfo {
  type: string;
  label: string;
  icon: string;
  description: string;
  execution: 'batch' | 'single';
  enabled: boolean;
  available: boolean;
  ownsDefinitions: boolean;
  customResults: boolean;
  createRoute: string | null;
}

export function scopesOf(type: AnyScannerType): { read: string; write: string } {
  return type.scopes ?? SCANNER_SCOPES;
}

export function callerCovers(callerScopes: readonly string[], scope: string): boolean {
  return callerScopes.includes(ADMIN_SCOPE) || callerScopes.includes(scope);
}

export function toTypeInfo(type: AnyScannerType, env: Env, callerScopes: readonly string[]): TypeInfo {
  return {
    type: type.type,
    label: type.label,
    icon: type.icon,
    description: type.description,
    execution: type.execution,
    enabled: type.isEnabled(env),
    available: callerCovers(callerScopes, scopesOf(type).read),
    ownsDefinitions: Boolean(type.definitions),
    customResults: Boolean(type.resultReader),
    createRoute: type.createRoute ?? null,
  };
}
