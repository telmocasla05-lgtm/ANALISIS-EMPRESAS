import type { NextFunction, Request, Response } from 'express';

// Log de una línea por petición en stdout (en Railway se ve en los Deploy Logs).
// El healthcheck se omite para no ensuciar los logs con los pings de la plataforma.
export function requestLog(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/api/health') {
    next();
    return;
  }
  const startedAt = Date.now();
  res.on('finish', () => {
    const elapsedMs = Date.now() - startedAt;
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${elapsedMs}ms`);
  });
  next();
}
