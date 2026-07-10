import type { NextFunction, Request, Response } from 'express';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  // El detalle (con stack) va a los logs; la respuesta nunca expone internos.
  console.error(`${new Date().toISOString()} ERROR ${req.method} ${req.originalUrl}`, err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Error interno del servidor' });
}
