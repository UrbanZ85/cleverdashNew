import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from './logger.js';

const HEADER = 'x-correlation-id';

declare module 'express-serve-static-core' {
  interface Request {
    correlationId: string;
    log: Logger;
  }
}

/** Vsak zahtevek dobi ID korelacije: prevzet iz glave, sicer nov. Ta ID gre v vsak log
 * zapis in v vsak Problem odgovor (platform/errors/problem.ts), da je napako mogoče
 * povezati z dnevnikom — člen VII. */
export function correlationMiddleware(baseLogger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.header(HEADER);
    const correlationId = incoming && incoming.length > 0 ? incoming : randomUUID();
    req.correlationId = correlationId;
    req.log = baseLogger.child({ correlationId });
    res.setHeader(HEADER, correlationId);
    next();
  };
}
