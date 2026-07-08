import type { NextFunction, Request, Response } from 'express';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Error interno del servidor' });
}
