import type { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// ──────────────────────────────────────────────
// Handler global d'erreurs
// Ne jamais exposer les stack traces en production
// ──────────────────────────────────────────────
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void => {
  const isDev = process.env.NODE_ENV === 'development';

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      ...(isDev && { stack: err.stack }),
    });
    return;
  }

  // Erreur CORS
  if (err.message.startsWith('CORS bloqué')) {
    res.status(403).json({ error: err.message });
    return;
  }

  // Erreur inattendue — logger sans exposer les détails
  logger.error('Erreur non gérée', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  res.status(500).json({
    error: 'Une erreur interne est survenue.',
    ...(isDev && { detail: err.message, stack: err.stack }),
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} introuvable.` });
};
