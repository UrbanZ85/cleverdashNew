import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

/** RFC 9457. Sporočila so v slovenščini in brez tehničnih podrobnosti (FR-026) —
 * `detail` je namenjen uporabniku, tehnični vzrok gre samo v dnevnik pod `correlationId`. */
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  correlationId?: string;
}

export class ProblemError extends Error {
  constructor(
    public readonly status: number,
    public readonly title: string,
    public readonly detail?: string,
    public readonly type = 'about:blank',
  ) {
    super(detail ?? title);
  }
}

export function notFound(detail?: string): ProblemError {
  return new ProblemError(404, 'Ni najdeno', detail);
}

export function unauthorized(detail?: string): ProblemError {
  return new ProblemError(401, 'Ni avtenticiran', detail);
}

export function forbidden(detail?: string): ProblemError {
  return new ProblemError(403, 'Ni dovoljeno', detail);
}

export function badRequest(detail?: string): ProblemError {
  return new ProblemError(400, 'Neveljavna zahteva', detail);
}

export function tooManyRequests(detail?: string): ProblemError {
  return new ProblemError(429, 'Preveč poskusov', detail);
}

export function serviceUnavailable(detail?: string): ProblemError {
  return new ProblemError(503, 'Trenutno nedosegljivo', detail);
}

/** Zadnji middleware v verigi. Nikoli ne uhaja sklad klicev ali sporočilo knjižnice
 * uporabniku — samo `correlationId`, s katerim se najde v dnevniku. */
export function problemErrorHandler() {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const correlationId = req.correlationId;
    if (err instanceof ProblemError) {
      // 401 je REDNO stanje, ne opozorilo: dostopni žeton poteče vsakih nekaj minut in
      // odjemalec sejo obnovi sam (apps/web/.../core/auth/token-lifetime.ts). Zabeleži se
      // torej, a brez sklada klicev in brez stopnje, ki v dnevniku izgleda kot okvara —
      // prej je vsak iztek pustil šop opozoril s skladom in zakril prave težave.
      // Vse ostalo (403, 404, 429, 503 …) ostane opozorilo, ker ni pričakovan del delovanja.
      if (err.status === 401) {
        req.log?.info({ correlationId, detail: err.detail, path: req.originalUrl }, err.title);
      } else {
        req.log?.warn({ err, correlationId }, err.title);
      }
      const body: Problem = {
        type: err.type,
        title: err.title,
        status: err.status,
        detail: err.detail,
        correlationId,
      };
      res.status(err.status).type('application/problem+json').json(body);
      return;
    }
    // 002-najdba: `schema.parse(req.body)` po vsej kodi (001 in 002) meče `ZodError`, ki ga
    // ta obravnavalec brez tega loči od resnično nepričakovane napake — vsako neveljavno
    // telo zahteve bi tiho postalo `500`, ne `400`. Popravek koristi obema funkcionalnostma.
    if (err instanceof ZodError) {
      req.log?.warn({ err, correlationId }, 'Neveljavno telo zahteve');
      const body: Problem = {
        type: 'about:blank',
        title: 'Neveljavna zahteva',
        status: 400,
        detail: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        correlationId,
      };
      res.status(400).type('application/problem+json').json(body);
      return;
    }
    req.log?.error({ err, correlationId }, 'Nepričakovana napaka');
    const body: Problem = {
      type: 'about:blank',
      title: 'Notranja napaka',
      status: 500,
      detail: 'Prišlo je do nepričakovane napake. Poskusi znova.',
      correlationId,
    };
    res.status(500).type('application/problem+json').json(body);
  };
}
