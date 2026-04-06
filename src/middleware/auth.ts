import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

const JWT_SECRET = process.env.JWT_SECRET!;

// Étend le type Request pour y attacher l'utilisateur vérifié
declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: 'client' | 'pro';
      };
    }
  }
}

// ──────────────────────────────────────────────
// requireAuth — vérifie le token JWT Bearer
// Attache req.auth si valide, rejette sinon
// ──────────────────────────────────────────────
export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token manquant ou mal formé.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; role: 'client' | 'pro' };

    req.auth = {
      userId: payload.userId,
      role: payload.role,
    };

    next();
  } catch (err) {
    logger.warn('Token JWT invalide', { error: err, ip: req.ip });
    res.status(401).json({ error: 'Token invalide ou expiré.' });
  }
};

// ──────────────────────────────────────────────
// requireRole — vérifie le rôle de l'utilisateur
// Usage : router.get('/pro-only', requireAuth, requireRole('pro'), handler)
// ──────────────────────────────────────────────
export const requireRole =
  (role: 'client' | 'pro') =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Non authentifié.' });
      return;
    }
    if (req.auth.role !== role) {
      res.status(403).json({ error: 'Accès refusé.' });
      return;
    }
    next();
  };
